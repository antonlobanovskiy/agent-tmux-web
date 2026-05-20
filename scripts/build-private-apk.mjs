import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const gradle = readFileSync(path.join(root, "android/app/build.gradle"), "utf8");
const baseVersionCode = Number(gradle.match(/\bversionCode\s+(?:configuredVersionCode \? configuredVersionCode\.toInteger\(\) : )?(\d+)/)?.[1] ?? 1);

const applicationIdSuffix = normalizeApplicationIdSuffix(
  process.env.AGENT_TMUX_ANDROID_ID_SUFFIX ?? ".private"
);
const appLabel = process.env.AGENT_TMUX_ANDROID_APP_LABEL ?? "Agent Tmux Private";
const versionCode = process.env.AGENT_TMUX_ANDROID_VERSION_CODE ?? String(baseVersionCode + 20000);
const versionName = process.env.AGENT_TMUX_ANDROID_VERSION_NAME ?? `${pkg.version}-private`;

const gradleArgs = [
  "assembleRelease",
  `-PagentTmuxApplicationIdSuffix=${applicationIdSuffix}`,
  `-PagentTmuxAppLabel=${appLabel}`,
  `-PagentTmuxVersionCode=${versionCode}`,
  `-PagentTmuxVersionName=${versionName}`
];

addOptionalGradleProperty(gradleArgs, "agentTmuxDefaultUrl", "AGENT_TMUX_ANDROID_DEFAULT_URL");
addOptionalGradleProperty(gradleArgs, "agentTmuxDefaultToken", "AGENT_TMUX_ANDROID_DEFAULT_TOKEN");
addOptionalGradleProperty(gradleArgs, "agentTmuxReleaseStoreFile", "AGENT_TMUX_ANDROID_KEYSTORE");
addOptionalGradleProperty(gradleArgs, "agentTmuxReleaseStorePassword", "AGENT_TMUX_ANDROID_KEYSTORE_PASSWORD");
addOptionalGradleProperty(gradleArgs, "agentTmuxReleaseKeyAlias", "AGENT_TMUX_ANDROID_KEY_ALIAS");
addOptionalGradleProperty(gradleArgs, "agentTmuxReleaseKeyPassword", "AGENT_TMUX_ANDROID_KEY_PASSWORD");

console.log(`Building private Android APK as com.agenttmux.web${applicationIdSuffix}`);
console.log(`App label: ${appLabel}`);
console.log(`Version: ${versionName} (${versionCode})`);
console.log("Default URL/token and signing values can also be set in android/local.properties.");

run("pnpm", ["build"], root);
run(gradleCommand(), gradleArgs, androidDir);

console.log(`Private APK output: android/app/build/outputs/apk/release/agent-tmux-web-v${versionName}-release.apk`);

function addOptionalGradleProperty(args, property, envKey) {
  if (Object.hasOwn(process.env, envKey)) {
    args.push(`-P${property}=${process.env[envKey] ?? ""}`);
  }
}

function normalizeApplicationIdSuffix(value) {
  const suffix = value.trim();
  if (!suffix) {
    fail("AGENT_TMUX_ANDROID_ID_SUFFIX must not be empty for private APK builds.");
  }
  const normalized = suffix.startsWith(".") ? suffix : `.${suffix}`;
  if (!/^\.[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/.test(normalized)) {
    fail(`Invalid Android application id suffix: ${value}`);
  }
  return normalized;
}

function gradleCommand() {
  return process.platform === "win32" ? "gradlew.bat" : "./gradlew";
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
