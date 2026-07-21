import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
const gradle = readFileSync(join(root, "android/app/build.gradle"), "utf8");
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");

describe("v0.1.24 release metadata", () => {
  it("keeps package and Android versions aligned", () => {
    expect(packageJson.version).toBe("0.1.24");
    expect(gradle).toMatch(/versionCode configuredVersionCode \? configuredVersionCode\.toInteger\(\) : 25\b/);
    expect(gradle).toContain('versionName configuredVersionName ?: "0.1.24"');
  });

  it("documents the release without stale removed-view guidance", () => {
    const release = changelog.slice(
      changelog.indexOf("## 0.1.24 - 2026-07-21"),
      changelog.indexOf("## 0.1.23 - 2026-07-18")
    );
    expect(release).toContain("Raw");
    expect(release).toContain("safe attachment references");
    expect(release).toContain("edge-to-edge");
    expect(release).toContain("version code `25`");
    expect(release).not.toMatch(/\bTTY view\b|Terminal.*Details tabs/);
  });
});
