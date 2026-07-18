import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = path.resolve(
  root,
  process.argv[2] ?? "android/app/build/outputs/bundle/release/app-release.aab"
);

if (!existsSync(bundlePath)) {
  fail(`Android App Bundle not found: ${path.relative(root, bundlePath)}`);
}

const verification = spawnSync("jarsigner", ["-verify", bundlePath], { encoding: "utf8" });
if (verification.status !== 0 || !verification.stdout.includes("jar verified")) {
  fail(`Android App Bundle signature verification failed.\n${verification.stdout}${verification.stderr}`);
}

const certificate = spawnSync("keytool", ["-printcert", "-jarfile", bundlePath], { encoding: "utf8" });
if (certificate.status !== 0) {
  fail(`Could not inspect the Android App Bundle signing certificate.\n${certificate.stderr}`);
}
if (/CN=Android Debug|Android Debug/i.test(certificate.stdout)) {
  fail("Google Play bundle is signed with Android's debug certificate.");
}

const fingerprint = certificate.stdout.match(/SHA-256:\s*([^\r\n]+)/)?.[1]?.trim();
console.log(
  `Play bundle signature check passed: ${path.relative(root, bundlePath)}` +
    (fingerprint ? ` (SHA-256 ${fingerprint})` : "")
);

function fail(message) {
  console.error(message);
  process.exit(1);
}
