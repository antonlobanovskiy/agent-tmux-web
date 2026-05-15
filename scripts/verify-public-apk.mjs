import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apkPath = path.resolve(root, process.argv[2] ?? "android/app/build/outputs/apk/release/app-release.apk");
const buildConfigPath = path.join(root, "android/app/build/generated/source/buildConfig/release/com/agenttmux/web/BuildConfig.java");

if (!existsSync(apkPath)) {
  fail(`APK not found: ${path.relative(root, apkPath)}`);
}

if (existsSync(buildConfigPath)) {
  const buildConfig = readFileSync(buildConfigPath, "utf8");
  requireEmptyBuildConfig(buildConfig, "DEFAULT_SERVER_URL");
  requireEmptyBuildConfig(buildConfig, "DEFAULT_AUTH_TOKEN");
}

const strings = dexStrings(apkPath);
const forbidden = [
  /https?:\/\/(?!["'\s]*$)[^\s"'<>]+/i,
  /\b100\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  /\bagentTmuxDefaultToken\b/,
  /\bAGENT_TMUX_WEB_AUTH_TOKEN\b/,
  /\bCODEX_WEB_AUTH_TOKEN\b/
];

for (const pattern of forbidden) {
  const match = strings.match(pattern);
  if (match) {
    fail(`Public APK contains a forbidden private-looking string: ${match[0]}`);
  }
}

console.log(`Public APK check passed: ${path.relative(root, apkPath)}`);

function dexStrings(file) {
  const unzip = spawnSync("unzip", ["-p", file, "classes.dex"], { encoding: "buffer" });
  if (unzip.status !== 0) {
    fail(`Failed to read classes.dex from APK. Is unzip installed?\n${String(unzip.stderr)}`);
  }

  const strings = spawnSync("strings", [], {
    input: unzip.stdout,
    encoding: "utf8"
  });
  if (strings.status !== 0) {
    fail(`Failed to inspect APK strings. Is strings/binutils installed?\n${strings.stderr}`);
  }
  return strings.stdout;
}

function requireEmptyBuildConfig(source, key) {
  const pattern = new RegExp(`public static final String ${key} = "([^"]*)";`);
  const match = source.match(pattern);
  if (!match) {
    fail(`Could not verify BuildConfig.${key}`);
  }
  if (match[1] !== "") {
    fail(`BuildConfig.${key} must be empty for a public APK`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
