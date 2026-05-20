import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apkPath = path.resolve(root, process.argv[2] ?? findNewestApk());
const assetsDir = path.join(root, "dist/client/assets");
const targetPath = path.join(assetsDir, path.basename(apkPath));

if (!existsSync(apkPath)) {
  fail(`APK not found: ${path.relative(root, apkPath)}`);
}

mkdirSync(assetsDir, { recursive: true });
copyFileSync(apkPath, targetPath);

const port = process.env.PORT || "6174";
const host = chooseHost();
const url = `http://${host}:${port}/assets/${encodeURIComponent(path.basename(apkPath))}`;

console.log(`Staged APK: ${path.relative(root, targetPath)}`);
console.log(`Download URL: ${url}`);
console.log(`Verify before sharing: curl -I ${url}`);

function findNewestApk() {
  const outputRoot = path.join(root, "android/app/build/outputs/apk");
  const apks = walk(outputRoot)
    .filter((file) => file.endsWith(".apk"))
    .map((file) => ({ file, mtimeMs: statSync(file).mtimeMs }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  if (!apks.length) {
    fail("No APK path was provided and no built APK was found under android/app/build/outputs/apk.");
  }
  return apks[0].file;
}

function walk(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function chooseHost() {
  const configured = process.env.AGENT_TMUX_DOWNLOAD_HOST || process.env.HOST;
  if (configured && configured !== "0.0.0.0" && configured !== "127.0.0.1") {
    return configured;
  }

  const tailscale = spawnSync("tailscale", ["ip", "-4"], { encoding: "utf8" });
  const tailscaleIp = tailscale.status === 0 ? tailscale.stdout.trim().split(/\s+/)[0] : "";
  if (tailscaleIp) {
    return tailscaleIp;
  }

  return configured || "YOUR_SERVER_HOST";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
