import { access, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildUploadTarget,
  cleanupExpiredUploads,
  DEFAULT_UPLOAD_TTL_MS,
  resolveUploadRoot,
  sanitizeUploadName,
  saveUploadedFile,
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
    expect(file.path.startsWith(root)).toBe(true);
    expect(file.size).toBe(18);
    expect(file.mimeType).toBe("image/png");
    await expect(readFile(file.path, "utf8")).resolves.toBe("hello from android");
  });

  it("rejects oversized uploads and removes partial files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-web-upload-test-"));
    tempRoots.push(root);

    await expect(saveUploadedFile(Readable.from(["too large"]), {
      originalName: "large.txt",
      root,
      maxBytes: 3
    })).rejects.toBeInstanceOf(UploadTooLargeError);
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
});
