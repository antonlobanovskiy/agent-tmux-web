import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, lstat, mkdir, readdir, rm, rmdir, stat, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Transform, type TransformCallback, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { UploadedFileDto } from "../shared/api.js";

export const DEFAULT_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
export const DEFAULT_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

export type SavedUploadedFile = {
  filePath: string;
  storedName: string;
  name: string;
  size: number;
  mimeType: string | null;
};

type SaveUploadedFileOptions = {
  originalName: string;
  mimeType?: string | null;
  root?: string;
  aliasRoot?: string;
  maxBytes?: number;
  now?: Date;
  id?: string;
};

type CleanupUploadsOptions = { ttlMs?: number; now?: Date };

export class UploadTooLargeError extends Error {
  statusCode = 413;

  constructor(maxBytes: number) {
    super(`Upload is larger than ${formatBytes(maxBytes)}`);
  }
}

export class UploadStorageError extends Error {
  statusCode = 500;

  constructor(cause: unknown) {
    super("Unable to store uploaded file", { cause });
    this.name = "UploadStorageError";
  }
}

export function resolveUploadRoot(): string {
  return path.resolve(process.env.AGENT_TMUX_WEB_UPLOAD_DIR
    ?? process.env.CODEX_WEB_UPLOAD_DIR
    ?? path.join(os.tmpdir(), "agent-tmux-web", "uploads"));
}

export function resolveLegacyUploadRoot(): string {
  return path.resolve(process.env.HOME ?? os.homedir() ?? process.cwd(), ".codex-web", "uploads");
}

export function resolveUploadAliasRoot(): string {
  return path.resolve(os.homedir(), ".agent-tmux", "attachments");
}

export function resolveUploadMaxBytes(): number {
  const value = Number(process.env.AGENT_TMUX_WEB_UPLOAD_MAX_BYTES ?? process.env.CODEX_WEB_UPLOAD_MAX_BYTES);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_UPLOAD_MAX_BYTES;
}

export function resolveUploadTtlMs(): number {
  const value = Number(process.env.AGENT_TMUX_WEB_UPLOAD_TTL_MS ?? process.env.CODEX_WEB_UPLOAD_TTL_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_UPLOAD_TTL_MS;
}

export function sanitizeUploadName(name: string): string {
  const sanitized = path.basename(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w .-]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);

  return sanitized || "upload";
}

export function buildUploadTarget(
  root: string,
  originalName: string,
  now = new Date(),
  id = randomUUID().slice(0, 8)
): { directory: string; filePath: string; storedName: string } {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    throw new Error("Upload ID must use 1-64 letters, numbers, underscores, or hyphens");
  }
  const resolvedRoot = path.resolve(root);
  const date = now.toISOString().slice(0, 10);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const directory = path.join(resolvedRoot, date);
  const storedName = `${stamp}-${id}-${sanitizeUploadName(originalName)}`;
  const filePath = path.join(directory, storedName);
  assertPathWithinRoot(resolvedRoot, directory);
  assertPathWithinRoot(resolvedRoot, filePath);
  return {
    directory,
    storedName,
    filePath
  };
}

export async function saveUploadedFile(
  input: Readable,
  options: SaveUploadedFileOptions
): Promise<SavedUploadedFile> {
  const target = buildUploadTarget(
    options.root ?? resolveUploadRoot(),
    options.originalName,
    options.now,
    options.id
  );
  await mkdir(target.directory, { recursive: true, mode: 0o700 });
  await chmod(target.directory, 0o700);

  const limiter = new ByteLimitTransform(options.maxBytes ?? resolveUploadMaxBytes());
  try {
    await pipeline(input, limiter, createWriteStream(target.filePath, { flags: "wx", mode: 0o600 }));
    await chmod(target.filePath, 0o600);
  } catch (error) {
    await rm(target.filePath, { force: true });
    throw error;
  }

  return {
    name: path.basename(options.originalName) || target.storedName,
    filePath: target.filePath,
    storedName: target.storedName,
    size: limiter.bytes,
    mimeType: options.mimeType ?? null
  };
}

export async function saveUploadedFileForClient(
  input: Readable,
  options: SaveUploadedFileOptions
): Promise<UploadedFileDto> {
  let saved: SavedUploadedFile | undefined;

  try {
    const storageRoot = path.resolve(options.root ?? resolveUploadRoot());
    const aliasRoot = path.resolve(options.aliasRoot ?? resolveUploadAliasRoot());
    if (pathsOverlap(storageRoot, aliasRoot)) {
      throw new Error("Upload storage and alias roots must not overlap");
    }
    saved = await saveUploadedFile(input, { ...options, root: storageRoot });
    const date = path.basename(path.dirname(saved.filePath));
    const aliasDirectory = path.join(aliasRoot, date);
    const aliasPath = path.join(aliasDirectory, saved.storedName);
    assertPathWithinRoot(aliasRoot, aliasDirectory);
    assertPathWithinRoot(aliasRoot, aliasPath);
    await mkdir(aliasDirectory, { recursive: true, mode: 0o700 });
    await chmod(aliasDirectory, 0o700);
    await symlink(saved.filePath, aliasPath, "file");

    return {
      name: saved.name,
      reference: `~/.agent-tmux/attachments/${date}/${saved.storedName}`,
      size: saved.size,
      mimeType: saved.mimeType
    };
  } catch (error) {
    if (error instanceof UploadTooLargeError) {
      throw error;
    }
    if (saved) {
      await rm(saved.filePath, { force: true }).catch(() => undefined);
    }
    throw new UploadStorageError(error);
  }
}

export async function cleanupExpiredUploads(
  root: string,
  options: CleanupUploadsOptions = {}
): Promise<void> {
  const ttlMs = options.ttlMs ?? resolveUploadTtlMs();
  const cutoff = (options.now ?? new Date()).getTime() - ttlMs;
  await cleanupExpiredUploadsInDirectory(path.resolve(root), cutoff, true);
}

export async function cleanupExpiredUploadAliases(
  root: string,
  options: CleanupUploadsOptions = {}
): Promise<void> {
  const ttlMs = options.ttlMs ?? resolveUploadTtlMs();
  const cutoff = (options.now ?? new Date()).getTime() - ttlMs;
  await cleanupExpiredUploadsInDirectory(path.resolve(root), cutoff, true, true);
}

export async function cleanupUploadRoots(
  targetRoots: string[],
  aliasRoot: string,
  options: CleanupUploadsOptions = {}
): Promise<void> {
  const roots = [...new Set(targetRoots.map((root) => path.resolve(root)))];
  for (const root of roots) {
    await cleanupExpiredUploads(root, options);
  }
  await cleanupExpiredUploadAliases(aliasRoot, options);
}

async function cleanupExpiredUploadsInDirectory(
  directory: string,
  cutoff: number,
  isRoot = false,
  removeDanglingSymlinks = false
): Promise<boolean> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return true;
    }
    throw error;
  }

  let empty = true;
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (isRoot && !isUploadDateDirectory(entry.name)) {
      empty = false;
      continue;
    }

    if (entry.isDirectory()) {
      const childEmpty = await cleanupExpiredUploadsInDirectory(entryPath, cutoff, false, removeDanglingSymlinks);
      if (childEmpty) {
        const removed = await removeEmptyDirectory(entryPath);
        if (!removed) {
          empty = false;
        }
      } else {
        empty = false;
      }
      continue;
    }

    if (entry.isFile() || entry.isSymbolicLink()) {
      const info = await lstat(entryPath).catch((error: unknown) => {
        if (isNodeError(error) && error.code === "ENOENT") {
          return null;
        }
        throw error;
      });
      const dangling = info && entry.isSymbolicLink() && removeDanglingSymlinks
        ? await isDanglingSymlink(entryPath)
        : false;
      if (!info || dangling || info.mtimeMs <= cutoff) {
        await rm(entryPath, { force: true }).catch(ignoreMissingFile);
      } else {
        empty = false;
      }
      continue;
    }

    empty = false;
  }

  return !isRoot && empty;
}

function isUploadDateDirectory(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(name);
}

class ByteLimitTransform extends Transform {
  bytes = 0;

  constructor(private readonly maxBytes: number) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.bytes += chunk.length;
    if (this.bytes > this.maxBytes) {
      callback(new UploadTooLargeError(this.maxBytes));
      return;
    }
    callback(null, chunk);
  }
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function isDanglingSymlink(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return false;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return true;
    }
    throw error;
  }
}

function assertPathWithinRoot(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Upload path escaped its configured root");
  }
}

function pathsOverlap(left: string, right: string): boolean {
  return isPathWithinOrEqual(left, right) || isPathWithinOrEqual(right, left);
}

function isPathWithinOrEqual(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function ignoreMissingFile(error: unknown): void {
  if (!isNodeError(error) || error.code !== "ENOENT") {
    throw error;
  }
}

async function removeEmptyDirectory(directory: string): Promise<boolean> {
  try {
    await rmdir(directory);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return true;
    }
    if (isNodeError(error) && error.code === "ENOTEMPTY") {
      return false;
    }
    throw error;
  }
}
