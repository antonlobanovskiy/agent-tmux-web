import { access, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertShowcaseMetadata,
  InvalidMarketingAssetError,
  recoverStaleAssetDirectories
} from "../marketing-assets.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createDocsDirectory() {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-tmux-marketing-"));
  temporaryRoots.push(root);
  const docsDir = path.join(root, "docs");
  await mkdir(docsDir);
  return { docsDir, publishedAssetsDir: path.join(docsDir, "assets") };
}

async function createManagedDirectory(docsDir, name, marker) {
  const directory = path.join(docsDir, name);
  await mkdir(directory);
  await writeFile(path.join(directory, marker), marker);
  return directory;
}

async function pathExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

const validateBackup = async (directory) => {
  try {
    await access(path.join(directory, "valid"));
  } catch (error) {
    throw new InvalidMarketingAssetError(`Invalid backup ${directory}`, { cause: error });
  }
};

describe("marketing asset interruption recovery", () => {
  it("removes cross-PID stale staging and backup directories when published assets exist", async () => {
    const { docsDir, publishedAssetsDir } = await createDocsDirectory();
    await createManagedDirectory(docsDir, "assets", "published");
    const staleStaging = await createManagedDirectory(docsDir, ".assets-staging-101", "partial");
    const staleBackup = await createManagedDirectory(docsDir, ".assets-backup-102", "valid");

    await recoverStaleAssetDirectories({
      docsDir,
      publishedAssetsDir,
      validateAssetDirectory: validateBackup,
      isPidAlive: () => false
    });

    expect(await pathExists(publishedAssetsDir)).toBe(true);
    expect(await pathExists(staleStaging)).toBe(false);
    expect(await pathExists(staleBackup)).toBe(false);
  });

  it("leaves staging and backup directories owned by a live process untouched", async () => {
    const { docsDir, publishedAssetsDir } = await createDocsDirectory();
    await createManagedDirectory(docsDir, "assets", "published");
    const liveStaging = await createManagedDirectory(docsDir, ".assets-staging-201", "partial");
    const liveBackup = await createManagedDirectory(docsDir, ".assets-backup-201", "valid");
    const staleStaging = await createManagedDirectory(docsDir, ".assets-staging-202", "partial");

    await recoverStaleAssetDirectories({
      docsDir,
      publishedAssetsDir,
      validateAssetDirectory: validateBackup,
      isPidAlive: (pid) => pid === 201
    });

    expect(await pathExists(liveStaging)).toBe(true);
    expect(await pathExists(liveBackup)).toBe(true);
    expect(await pathExists(staleStaging)).toBe(false);
  });

  it("restores the newest valid stale backup when published assets are missing", async () => {
    const { docsDir, publishedAssetsDir } = await createDocsDirectory();
    const olderValid = await createManagedDirectory(docsDir, ".assets-backup-301", "valid");
    await writeFile(path.join(olderValid, "identity"), "older");
    const newerInvalid = await createManagedDirectory(docsDir, ".assets-backup-302", "invalid");
    const newestValid = await createManagedDirectory(docsDir, ".assets-backup-303", "valid");
    await writeFile(path.join(newestValid, "identity"), "newest");
    const staleStaging = await createManagedDirectory(docsDir, ".assets-staging-304", "partial");
    const liveBackup = await createManagedDirectory(docsDir, ".assets-backup-305", "valid");
    const now = Date.now() / 1000;
    await utimes(olderValid, now - 30, now - 30);
    await utimes(newerInvalid, now - 20, now - 20);
    await utimes(newestValid, now - 10, now - 10);

    await recoverStaleAssetDirectories({
      docsDir,
      publishedAssetsDir,
      validateAssetDirectory: validateBackup,
      isPidAlive: (pid) => pid === 305
    });

    expect(await readFile(path.join(publishedAssetsDir, "identity"), "utf8")).toBe("newest");
    expect(await pathExists(olderValid)).toBe(false);
    expect(await pathExists(newerInvalid)).toBe(false);
    expect(await pathExists(newestValid)).toBe(false);
    expect(await pathExists(staleStaging)).toBe(false);
    expect(await pathExists(liveBackup)).toBe(true);
  });
});

describe("showcase MP4 metadata validation", () => {
  const requiredVideo = {
    codec_type: "video",
    codec_name: "h264",
    width: 1920,
    height: 1080,
    pix_fmt: "yuv420p",
    r_frame_rate: "30/1"
  };
  const expected = { width: 1920, height: 1080, fps: 30, minDuration: 12, maxDuration: 18 };

  it("accepts exactly one conforming video stream", () => {
    const metadata = { streams: [requiredVideo], format: { duration: "12.8" } };

    expect(() => assertShowcaseMetadata(metadata, expected)).not.toThrow();
  });

  it("rejects a video without a finite duration", () => {
    const metadata = { streams: [requiredVideo], format: {} };

    expect(() => assertShowcaseMetadata(metadata, expected)).toThrow(InvalidMarketingAssetError);
  });

  it.each([
    ["audio", { codec_type: "audio", codec_name: "aac" }],
    ["additional video", { ...requiredVideo }],
    ["subtitle", { codec_type: "subtitle", codec_name: "mov_text" }]
  ])("rejects an %s stream in addition to the required video", (_label, additionalStream) => {
    const metadata = {
      streams: [requiredVideo, additionalStream],
      format: { duration: "12.8" }
    };

    expect(() => assertShowcaseMetadata(metadata, expected)).toThrow(InvalidMarketingAssetError);
  });
});
