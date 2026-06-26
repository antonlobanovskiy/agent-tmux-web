import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const defaultApkPath = `android/app/build/outputs/apk/release/agent-tmux-web-v${version}-release.apk`;
const artifactPath = path.resolve(root, process.argv[2] ?? defaultApkPath);
const buildConfigPath = path.join(root, "android/app/build/generated/source/buildConfig/release/com/agenttmux/web/BuildConfig.java");

if (!existsSync(artifactPath)) {
  fail(`Android artifact not found: ${path.relative(root, artifactPath)}`);
}

if (existsSync(buildConfigPath)) {
  const buildConfig = readFileSync(buildConfigPath, "utf8");
  requireBuildConfigValue(buildConfig, "APPLICATION_ID", "com.agenttmux.web");
  requireEmptyBuildConfig(buildConfig, "DEFAULT_SERVER_URL");
  requireEmptyBuildConfig(buildConfig, "DEFAULT_AUTH_TOKEN");
}

const strings = dexStrings(artifactPath);
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

console.log(`Public Android artifact check passed: ${path.relative(root, artifactPath)}`);

function dexStrings(file) {
  const entries = spawnSync("unzip", ["-Z1", file], { encoding: "utf8" });
  if (entries.status !== 0) {
    fail(`Failed to list Android artifact entries. Is unzip installed?\n${entries.stderr}`);
  }

  const dexEntries = entries.stdout
    .split(/\r?\n/)
    .filter((entry) => /(?:^|\/)classes\d*\.dex$/.test(entry));

  if (dexEntries.length === 0) {
    fail("No classes.dex entries found in Android artifact.");
  }

  const dexBuffers = dexEntries.map((entry) => {
    const unzip = spawnSync("unzip", ["-p", file, entry], { encoding: "buffer" });
    if (unzip.status !== 0) {
      fail(`Failed to read ${entry} from Android artifact.\n${String(unzip.stderr)}`);
    }
    return unzip.stdout;
  });

  const strings = spawnSync("strings", [], {
    input: Buffer.concat(dexBuffers),
    encoding: "utf8"
  });
  if (strings.status !== 0) {
    fail(`Failed to inspect Android artifact strings. Is strings/binutils installed?\n${strings.stderr}`);
  }

  return strings.stdout;
}

function requireEmptyBuildConfig(source, key) {
  requireBuildConfigValue(source, key, "");
}

function requireBuildConfigValue(source, key, expected) {
  const pattern = new RegExp(`public static final String ${key} = "([^"]*)";`);
  const match = source.match(pattern);
  if (!match) {
    fail(`Could not verify BuildConfig.${key}`);
  }
  if (match[1] !== expected) {
    fail(`BuildConfig.${key} must be ${JSON.stringify(expected)} for a public APK`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
