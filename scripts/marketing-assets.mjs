import { access, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

const MANAGED_ASSET_DIRECTORY = /^\.assets-(staging|backup)-([1-9]\d*)$/;

export class InvalidMarketingAssetError extends Error {
  name = "InvalidMarketingAssetError";
}

export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") {
      return false;
    }
    return true;
  }
}

export async function recoverStaleAssetDirectories({
  docsDir,
  publishedAssetsDir,
  validateAssetDirectory,
  isPidAlive = isProcessAlive
}) {
  const managedDirectories = [];
  for (const entry of await readdir(docsDir, { withFileTypes: true })) {
    const match = entry.isDirectory() && entry.name.match(MANAGED_ASSET_DIRECTORY);
    if (!match) {
      continue;
    }
    const pid = Number(match[2]);
    if (isPidAlive(pid)) {
      continue;
    }
    const directory = path.join(docsDir, entry.name);
    try {
      managedDirectories.push({ type: match[1], directory, mtimeMs: (await stat(directory)).mtimeMs });
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  const staleStaging = managedDirectories.filter(({ type }) => type === "staging");
  await Promise.all(staleStaging.map(({ directory }) => rm(directory, { recursive: true, force: true })));

  const staleBackups = managedDirectories
    .filter(({ type }) => type === "backup")
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  if (await pathExists(publishedAssetsDir)) {
    await Promise.all(staleBackups.map(({ directory }) => rm(directory, { recursive: true, force: true })));
    return;
  }

  let restoredBackup;
  for (const { directory } of staleBackups) {
    try {
      await validateAssetDirectory(directory);
    } catch (error) {
      if (error instanceof InvalidMarketingAssetError) {
        continue;
      }
      throw error;
    }
    await rename(directory, publishedAssetsDir);
    restoredBackup = directory;
    break;
  }

  await Promise.all(staleBackups
    .filter(({ directory }) => directory !== restoredBackup)
    .map(({ directory }) => rm(directory, { recursive: true, force: true })));
}

export function assertShowcaseMetadata(metadata, { width, height, fps, minDuration, maxDuration }) {
  const streams = metadata.streams ?? [];
  const videoStreams = streams.filter(({ codec_type: codecType }) => codecType === "video");
  const audioStreams = streams.filter(({ codec_type: codecType }) => codecType === "audio");
  const [stream] = videoStreams;
  const duration = Number(metadata.format?.duration);
  if (
    streams.length !== 1
    || videoStreams.length !== 1
    || audioStreams.length !== 0
    || stream.codec_name !== "h264"
    || stream.width !== width
    || stream.height !== height
    || stream.pix_fmt !== "yuv420p"
    || stream.r_frame_rate !== `${fps}/1`
    || !Number.isFinite(duration)
    || duration < minDuration
    || duration > maxDuration
  ) {
    throw new InvalidMarketingAssetError(`Invalid showcase metadata: ${JSON.stringify(metadata)}`);
  }
}

async function pathExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
