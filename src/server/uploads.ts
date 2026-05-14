import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { lstat, mkdir, readdir, rm, rmdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Transform, type TransformCallback, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { UploadedFileDto } from "../shared/api.js";

export const DEFAULT_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
export const DEFAULT_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

export class UploadTooLargeError extends Error {
  statusCode = 413;

  constructor(maxBytes: number) {
    super(`Upload is larger than ${formatBytes(maxBytes)}`);
  }
}

export function resolveUploadRoot(): string {
  return process.env.AGENT_TMUX_WEB_UPLOAD_DIR
    ?? process.env.CODEX_WEB_UPLOAD_DIR
    ?? path.join(os.tmpdir(), "agent-tmux-web", "uploads");
}

export function resolveLegacyUploadRoot(): string {
  return path.join(process.env.HOME ?? os.homedir() ?? process.cwd(), ".codex-web", "uploads");
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
  const date = now.toISOString().slice(0, 10);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const directory = path.join(root, date);
  const storedName = `${stamp}-${id}-${sanitizeUploadName(originalName)}`;
  return {
    directory,
    storedName,
    filePath: path.join(directory, storedName)
  };
}

export async function saveUploadedFile(
  input: Readable,
  options: {
    originalName: string;
    mimeType?: string | null;
    root?: string;
    maxBytes?: number;
  }
): Promise<UploadedFileDto> {
  const target = buildUploadTarget(options.root ?? resolveUploadRoot(), options.originalName);
  await mkdir(target.directory, { recursive: true });

  const limiter = new ByteLimitTransform(options.maxBytes ?? resolveUploadMaxBytes());
  try {
    await pipeline(input, limiter, createWriteStream(target.filePath, { flags: "wx" }));
  } catch (error) {
    await rm(target.filePath, { force: true });
    throw error;
  }

  return {
    name: path.basename(options.originalName) || target.storedName,
    path: target.filePath,
    size: limiter.bytes,
    mimeType: options.mimeType ?? null
  };
}

export async function cleanupExpiredUploads(
  root: string,
  options: { ttlMs?: number; now?: Date } = {}
): Promise<void> {
  const ttlMs = options.ttlMs ?? resolveUploadTtlMs();
  const cutoff = (options.now ?? new Date()).getTime() - ttlMs;
  await cleanupExpiredUploadsInDirectory(root, cutoff, true);
}

async function cleanupExpiredUploadsInDirectory(directory: string, cutoff: number, isRoot = false): Promise<boolean> {
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
    if (entry.isDirectory()) {
      const childEmpty = await cleanupExpiredUploadsInDirectory(entryPath, cutoff);
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
      if (!info || info.mtimeMs <= cutoff) {
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
