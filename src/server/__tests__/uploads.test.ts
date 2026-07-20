import { access, chmod, lstat, lutimes, mkdir, mkdtemp, readFile, readdir, readlink, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildUploadTarget,
  cleanupExpiredUploadAliases,
  cleanupExpiredUploads,
  cleanupUploadRoots,
  combineUploadFailureCauses,
  DEFAULT_UPLOAD_TTL_MS,
  resolveUploadAliasRoot,
  resolveUploadRoot,
  sanitizeUploadName,
  saveUploadedFile,
  saveUploadedFileForClient,
  UploadStorageError,
  UploadTooLargeError
} from "../uploads.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("upload helpers", () => {
  it("stores browser uploads in the server temp directory by default", () => {
    const previous = process.env.AGENT_TMUX_WEB_UPLOAD_DIR;
    const previousLegacy = process.env.CODEX_WEB_UPLOAD_DIR;
    delete process.env.AGENT_TMUX_WEB_UPLOAD_DIR;
    delete process.env.CODEX_WEB_UPLOAD_DIR;
    try {
      expect(resolveUploadRoot()).toBe(path.join(os.tmpdir(), "agent-tmux-web", "uploads"));
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_TMUX_WEB_UPLOAD_DIR;
      } else {
        process.env.AGENT_TMUX_WEB_UPLOAD_DIR = previous;
      }
      if (previousLegacy === undefined) {
        delete process.env.CODEX_WEB_UPLOAD_DIR;
      } else {
        process.env.CODEX_WEB_UPLOAD_DIR = previousLegacy;
      }
    }
  });

  it("resolves upload aliases below the user's home directory", () => {
    expect(resolveUploadAliasRoot()).toBe(path.join(os.homedir(), ".agent-tmux", "attachments"));
  });

  it("canonicalizes configured and option upload roots", async () => {
    const previous = process.env.AGENT_TMUX_WEB_UPLOAD_DIR;
    process.env.AGENT_TMUX_WEB_UPLOAD_DIR = "relative-upload-root";
    try {
      expect(resolveUploadRoot()).toBe(path.resolve("relative-upload-root"));
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_TMUX_WEB_UPLOAD_DIR;
      } else {
        process.env.AGENT_TMUX_WEB_UPLOAD_DIR = previous;
      }
    }

    const parent = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-relative-test-"));
    const storageRoot = path.join(parent, "storage");
    const aliasRoot = path.join(parent, "aliases");
    tempRoots.push(parent);
    await mkdir(storageRoot);
    await mkdir(aliasRoot);
    const relativeStorageRoot = path.relative(process.cwd(), storageRoot);
    const relativeAliasRoot = path.relative(process.cwd(), aliasRoot);

    const file = await saveUploadedFileForClient(Readable.from(["image"]), {
      originalName: "photo.png",
      root: relativeStorageRoot,
      aliasRoot: relativeAliasRoot,
      now: new Date("2026-07-20T02:38:49.000Z"),
      id: "relative"
    });

    const aliasPath = path.join(aliasRoot, "2026-07-20", path.basename(file.reference));
    const targetPath = await readlink(aliasPath);
    expect(path.isAbsolute(targetPath)).toBe(true);
    expect(path.relative(storageRoot, targetPath).startsWith("..")).toBe(false);
    await expect(readFile(aliasPath, "utf8")).resolves.toBe("image");
  });

  it("rejects equal or nested storage and alias roots before writing", async () => {
    const cases = [
      { name: "equal", roots: (parent: string) => [parent, parent] },
      { name: "alias inside storage", roots: (parent: string) => [parent, path.join(parent, "aliases")] },
      { name: "storage inside alias", roots: (parent: string) => [path.join(parent, "storage"), parent] }
    ] as const;

    for (const testCase of cases) {
      const parent = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-overlap-test-"));
      tempRoots.push(parent);
      const [storageRoot, aliasRoot] = testCase.roots(parent);

      const error = await saveUploadedFileForClient(Readable.from(["image"]), {
        originalName: "photo.png",
        root: storageRoot,
        aliasRoot
      }).catch((caught: unknown) => caught);

      expect(error, testCase.name).toBeInstanceOf(UploadStorageError);
      expect(((error as UploadStorageError).cause as Error).message, testCase.name)
        .toBe("Upload storage and alias roots must not overlap");
      expect((error as UploadStorageError).message, testCase.name).not.toContain(storageRoot);
      expect((error as UploadStorageError).message, testCase.name).not.toContain(aliasRoot);
      await expect(readdir(parent, { recursive: true }), testCase.name).resolves.toHaveLength(0);
    }
  });

  it("rejects unsafe or overlong deterministic upload IDs before writing", async () => {
    const invalidIds = ["bad/id", "bad\nid", "a".repeat(65)];

    for (const id of invalidIds) {
      const storageRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-id-test-"));
      const aliasRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-alias-test-"));
      tempRoots.push(storageRoot, aliasRoot);

      const error = await saveUploadedFileForClient(Readable.from(["image"]), {
        originalName: "photo.png",
        root: storageRoot,
        aliasRoot,
        id
      }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(UploadStorageError);
      expect(((error as UploadStorageError).cause as Error).message)
        .toBe("Upload ID must use 1-64 letters, numbers, underscores, or hyphens");
      expect((error as UploadStorageError).message).toBe("Unable to store uploaded file");
      await expect(readdir(storageRoot, { recursive: true })).resolves.toHaveLength(0);
      await expect(readdir(aliasRoot, { recursive: true })).resolves.toHaveLength(0);
    }
  });

  it("sanitizes remote browser filenames before storing them on the server", () => {
    expect(sanitizeUploadName("../../Screen Shot 2026/05/14.png")).toBe("14.png");
    expect(sanitizeUploadName("résumé draft #1.pdf")).toBe("resume-draft-1.pdf");
    expect(sanitizeUploadName("???")).toBe("upload");
  });

  it("builds dated absolute upload targets", () => {
    const target = buildUploadTarget(
      "/tmp/agent-tmux-web-uploads",
      "demo image.png",
      new Date("2026-05-14T12:34:56.000Z"),
      "abc123"
    );

    expect(target).toEqual({
      directory: "/tmp/agent-tmux-web-uploads/2026-05-14",
      storedName: "20260514T123456Z-abc123-demo-image.png",
      filePath: "/tmp/agent-tmux-web-uploads/2026-05-14/20260514T123456Z-abc123-demo-image.png"
    });
  });

  it("saves an uploaded stream and reports the server path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-web-upload-test-"));
    tempRoots.push(root);

    const file = await saveUploadedFile(Readable.from(["hello from android"]), {
      originalName: "photo.png",
      mimeType: "image/png",
      root,
      maxBytes: 1024
    });

    expect(file.name).toBe("photo.png");
    expect(file.filePath.startsWith(root)).toBe(true);
    expect(file.storedName).toBe(path.basename(file.filePath));
    expect(file.size).toBe(18);
    expect(file.mimeType).toBe("image/png");
    await expect(readFile(file.filePath, "utf8")).resolves.toBe("hello from android");
  });

  it("returns a deterministic safe reference instead of the storage path", async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-storage-test-"));
    const aliasRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-alias-test-"));
    tempRoots.push(storageRoot, aliasRoot);

    const file = await saveUploadedFileForClient(Readable.from(["image"]), {
      originalName: "photo.png",
      mimeType: "image/png",
      root: storageRoot,
      aliasRoot,
      maxBytes: 1024,
      now: new Date("2026-07-20T02:38:49.000Z"),
      id: "abc12345"
    });

    expect(file).toEqual({
      name: "photo.png",
      reference: "~/.agent-tmux/attachments/2026-07-20/20260720T023849Z-abc12345-photo.png",
      size: 5,
      mimeType: "image/png"
    });
    expect(file).not.toHaveProperty("path");
    expect(JSON.stringify({ file })).not.toContain(storageRoot);
  });

  it("creates unique readable symlink aliases", async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-storage-test-"));
    const aliasRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-alias-test-"));
    tempRoots.push(storageRoot, aliasRoot);
    const now = new Date("2026-07-20T02:38:49.000Z");

    const first = await saveUploadedFileForClient(Readable.from(["first"]), {
      originalName: "report.txt",
      root: storageRoot,
      aliasRoot,
      now,
      id: "first-id"
    });
    const second = await saveUploadedFileForClient(Readable.from(["second"]), {
      originalName: "report.txt",
      root: storageRoot,
      aliasRoot,
      now,
      id: "second-id"
    });

    expect(first.reference).not.toBe(second.reference);
    const firstAlias = path.join(aliasRoot, "2026-07-20", path.basename(first.reference));
    const secondAlias = path.join(aliasRoot, "2026-07-20", path.basename(second.reference));
    expect(await readlink(firstAlias)).toContain(storageRoot);
    await expect(readFile(firstAlias, "utf8")).resolves.toBe("first");
    await expect(readFile(secondAlias, "utf8")).resolves.toBe("second");
  });

  it("enforces private modes on dated directories and stored files", async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-storage-test-"));
    const aliasRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-alias-test-"));
    const date = "2026-07-20";
    const storageDirectory = path.join(storageRoot, date);
    const aliasDirectory = path.join(aliasRoot, date);
    tempRoots.push(storageRoot, aliasRoot);
    await mkdir(storageDirectory);
    await mkdir(aliasDirectory);
    await chmod(storageDirectory, 0o777);
    await chmod(aliasDirectory, 0o777);

    const file = await saveUploadedFileForClient(Readable.from(["image"]), {
      originalName: "photo.png",
      root: storageRoot,
      aliasRoot,
      now: new Date("2026-07-20T02:38:49.000Z"),
      id: "private"
    });

    const aliasPath = path.join(aliasDirectory, path.basename(file.reference));
    const targetPath = await readlink(aliasPath);
    expect((await stat(storageDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(aliasDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(targetPath)).mode & 0o777).toBe(0o600);
  });

  it("returns a fixed public error when storage directory creation fails", async () => {
    const storageParent = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-storage-test-"));
    const storageRoot = path.join(storageParent, "not-a-directory");
    const aliasRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-alias-test-"));
    tempRoots.push(storageParent, aliasRoot);
    await writeFile(storageRoot, "blocked");

    const error = await saveUploadedFileForClient(Readable.from(["image"]), {
      originalName: "photo.png",
      root: storageRoot,
      aliasRoot,
      maxBytes: 1024
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UploadStorageError);
    expect((error as UploadStorageError).message).toBe("Unable to store uploaded file");
    expect((error as UploadStorageError).statusCode).toBe(500);
    expect((error as UploadStorageError).cause).toBeInstanceOf(Error);
    expect(((error as UploadStorageError).cause as Error).message).toContain(storageRoot);
    const responseBody = JSON.stringify({ error: (error as UploadStorageError).message });
    expect(responseBody).not.toContain(storageRoot);
    expect(responseBody).not.toContain(aliasRoot);
  });

  it("removes the stored file when alias creation fails", async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-storage-test-"));
    const aliasParent = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-alias-test-"));
    const aliasRoot = path.join(aliasParent, "not-a-directory");
    tempRoots.push(storageRoot, aliasParent);
    await writeFile(aliasRoot, "blocked");

    const error = await saveUploadedFileForClient(Readable.from(["image"]), {
      originalName: "photo.png",
      root: storageRoot,
      aliasRoot,
      maxBytes: 1024
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UploadStorageError);
    expect((error as UploadStorageError).message).toBe("Unable to store uploaded file");
    expect((error as UploadStorageError).cause).toBeInstanceOf(Error);
    expect(((error as UploadStorageError).cause as Error).message).toContain(aliasRoot);
    const responseBody = JSON.stringify({ error: (error as UploadStorageError).message });
    expect(responseBody).not.toContain(storageRoot);
    expect(responseBody).not.toContain(aliasRoot);
    await expect(readdir(storageRoot, { recursive: true })).resolves.toHaveLength(1);
  });

  it("preserves alias creation and rollback failures behind the fixed public error", () => {
    const aliasError = new Error("alias creation failed");
    const rollbackError = new Error("stored target removal failed");
    const error = new UploadStorageError(combineUploadFailureCauses(aliasError, rollbackError));

    expect(error.message).toBe("Unable to store uploaded file");
    expect(error.cause).toBeInstanceOf(AggregateError);
    expect((error.cause as AggregateError).errors).toEqual([aliasError, rollbackError]);
    const responseBody = JSON.stringify({ error: error.message });
    expect(responseBody).not.toContain(aliasError.message);
    expect(responseBody).not.toContain(rollbackError.message);
  });

  it("rejects oversized uploads and removes partial files", async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-web-upload-test-"));
    const aliasRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-alias-test-"));
    tempRoots.push(storageRoot, aliasRoot);

    await expect(saveUploadedFileForClient(Readable.from(["too large"]), {
      originalName: "large.txt",
      root: storageRoot,
      aliasRoot,
      maxBytes: 3
    })).rejects.toBeInstanceOf(UploadTooLargeError);
    await expect(readdir(storageRoot, { recursive: true })).resolves.toHaveLength(1);
    await expect(readdir(aliasRoot, { recursive: true })).resolves.toHaveLength(0);
  });

  it("cleans expired uploaded files and leaves fresh files available", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-web-upload-test-"));
    tempRoots.push(root);
    const oldDirectory = path.join(root, "2026-05-13");
    const freshDirectory = path.join(root, "2026-05-14");
    await mkdir(oldDirectory, { recursive: true });
    await mkdir(freshDirectory, { recursive: true });
    const oldFile = path.join(oldDirectory, "old.txt");
    const freshFile = path.join(freshDirectory, "fresh.txt");
    await writeFile(oldFile, "old");
    await writeFile(freshFile, "fresh");
    const now = new Date("2026-05-14T12:00:00.000Z");
    await utimes(oldFile, new Date("2026-05-13T11:00:00.000Z"), new Date("2026-05-13T11:00:00.000Z"));
    await utimes(freshFile, new Date("2026-05-14T11:00:00.000Z"), new Date("2026-05-14T11:00:00.000Z"));

    await cleanupExpiredUploads(root, { now, ttlMs: DEFAULT_UPLOAD_TTL_MS });

    await expect(access(oldFile)).rejects.toThrow();
    await expect(access(oldDirectory)).rejects.toThrow();
    await expect(readFile(freshFile, "utf8")).resolves.toBe("fresh");
  });

  it("removes broken and expired aliases while preserving fresh valid aliases", async () => {
    const targetRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-target-test-"));
    const aliasRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-alias-test-"));
    const aliasDirectory = path.join(aliasRoot, "2026-05-14");
    tempRoots.push(targetRoot, aliasRoot);
    await mkdir(aliasDirectory);

    const freshTarget = path.join(targetRoot, "fresh.txt");
    const expiredTarget = path.join(targetRoot, "expired.txt");
    const boundaryTarget = path.join(targetRoot, "boundary.txt");
    await writeFile(freshTarget, "fresh");
    await writeFile(expiredTarget, "expired");
    await writeFile(boundaryTarget, "boundary");

    const brokenAlias = path.join(aliasDirectory, "broken.txt");
    const freshAlias = path.join(aliasDirectory, "fresh.txt");
    const expiredAlias = path.join(aliasDirectory, "expired.txt");
    const boundaryAlias = path.join(aliasDirectory, "boundary.txt");
    await symlink(path.join(targetRoot, "missing.txt"), brokenAlias, "file");
    await symlink(freshTarget, freshAlias, "file");
    await symlink(expiredTarget, expiredAlias, "file");
    await symlink(boundaryTarget, boundaryAlias, "file");

    const now = new Date("2026-05-14T12:00:00.000Z");
    const freshTime = new Date("2026-05-14T11:00:00.000Z");
    const expiredTime = new Date("2026-05-13T11:59:59.999Z");
    const boundaryTime = new Date("2026-05-13T12:00:00.000Z");
    await lutimes(brokenAlias, freshTime, freshTime);
    await lutimes(freshAlias, freshTime, freshTime);
    await lutimes(expiredAlias, expiredTime, expiredTime);
    await lutimes(boundaryAlias, boundaryTime, boundaryTime);

    await cleanupExpiredUploadAliases(aliasRoot, { now, ttlMs: DEFAULT_UPLOAD_TTL_MS });

    await expect(lstat(brokenAlias)).rejects.toThrow();
    await expect(readFile(freshAlias, "utf8")).resolves.toBe("fresh");
    await expect(lstat(expiredAlias)).rejects.toThrow();
    await expect(lstat(boundaryAlias)).rejects.toThrow();
    await expect(readFile(expiredTarget, "utf8")).resolves.toBe("expired");
    await expect(readFile(boundaryTarget, "utf8")).resolves.toBe("boundary");
  });

  it("cleans targets before aliases and preserves legacy cleanup", async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-storage-test-"));
    const legacyRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-legacy-test-"));
    const aliasRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-alias-test-"));
    const date = "2026-05-13";
    const storageDirectory = path.join(storageRoot, date);
    const legacyDirectory = path.join(legacyRoot, date);
    const aliasDirectory = path.join(aliasRoot, date);
    tempRoots.push(storageRoot, legacyRoot, aliasRoot);
    await mkdir(storageDirectory);
    await mkdir(legacyDirectory);
    await mkdir(aliasDirectory);

    const targetPath = path.join(storageDirectory, "target.txt");
    const legacyPath = path.join(legacyDirectory, "legacy.txt");
    const aliasPath = path.join(aliasDirectory, "target.txt");
    await writeFile(targetPath, "target");
    await writeFile(legacyPath, "legacy");
    await symlink(targetPath, aliasPath, "file");
    const expiredTime = new Date("2026-05-13T11:00:00.000Z");
    const freshTime = new Date("2026-05-14T11:00:00.000Z");
    await utimes(targetPath, expiredTime, expiredTime);
    await utimes(legacyPath, expiredTime, expiredTime);
    await lutimes(aliasPath, freshTime, freshTime);

    await cleanupUploadRoots([storageRoot, legacyRoot], aliasRoot, {
      now: new Date("2026-05-14T12:00:00.000Z"),
      ttlMs: DEFAULT_UPLOAD_TTL_MS
    });

    await expect(access(targetPath)).rejects.toThrow();
    await expect(access(legacyPath)).rejects.toThrow();
    await expect(lstat(aliasPath)).rejects.toThrow();
  });

  it("attempts every target and alias cleanup before reporting all failures", async () => {
    const failureParent = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-cleanup-failure-test-"));
    const firstFailingRoot = path.join(failureParent, "first-file-root");
    const secondFailingRoot = path.join(failureParent, "second-file-root");
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-storage-test-"));
    const aliasRoot = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-alias-test-"));
    const date = "2026-05-13";
    const storageDirectory = path.join(storageRoot, date);
    const aliasDirectory = path.join(aliasRoot, date);
    tempRoots.push(failureParent, storageRoot, aliasRoot);
    await writeFile(firstFailingRoot, "blocked");
    await writeFile(secondFailingRoot, "blocked");
    await mkdir(storageDirectory);
    await mkdir(aliasDirectory);

    const targetPath = path.join(storageDirectory, "target.txt");
    const aliasPath = path.join(aliasDirectory, "target.txt");
    await writeFile(targetPath, "target");
    await symlink(targetPath, aliasPath, "file");
    const expiredTime = new Date("2026-05-13T11:00:00.000Z");
    const freshTime = new Date("2026-05-14T11:00:00.000Z");
    await utimes(targetPath, expiredTime, expiredTime);
    await lutimes(aliasPath, freshTime, freshTime);

    const error = await cleanupUploadRoots(
      [firstFailingRoot, storageRoot, secondFailingRoot],
      aliasRoot,
      { now: new Date("2026-05-14T12:00:00.000Z"), ttlMs: DEFAULT_UPLOAD_TTL_MS }
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toHaveLength(2);
    expect((error as AggregateError).errors.map((cause) => (cause as Error).message).join(" "))
      .toContain(firstFailingRoot);
    expect((error as AggregateError).errors.map((cause) => (cause as Error).message).join(" "))
      .toContain(secondFailingRoot);
    await expect(access(targetPath)).rejects.toThrow();
    await expect(lstat(aliasPath)).rejects.toThrow();
  });

  it("only cleans dated upload directories below the upload root", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-web-upload-test-"));
    tempRoots.push(root);
    const unrelatedDirectory = path.join(root, "unrelated");
    const oldUploadDirectory = path.join(root, "2026-05-13");
    await mkdir(unrelatedDirectory, { recursive: true });
    await mkdir(oldUploadDirectory, { recursive: true });
    const unrelatedFile = path.join(unrelatedDirectory, "old.txt");
    const oldUploadFile = path.join(oldUploadDirectory, "old.txt");
    await writeFile(unrelatedFile, "keep");
    await writeFile(oldUploadFile, "delete");
    await utimes(unrelatedFile, new Date("2026-05-13T11:00:00.000Z"), new Date("2026-05-13T11:00:00.000Z"));
    await utimes(oldUploadFile, new Date("2026-05-13T11:00:00.000Z"), new Date("2026-05-13T11:00:00.000Z"));

    await cleanupExpiredUploads(root, { now: new Date("2026-05-14T12:00:00.000Z"), ttlMs: DEFAULT_UPLOAD_TTL_MS });

    await expect(readFile(unrelatedFile, "utf8")).resolves.toBe("keep");
    await expect(access(oldUploadFile)).rejects.toThrow();
  });
});
