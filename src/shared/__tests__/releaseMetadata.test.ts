import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
const gradle = readFileSync(join(root, "android/app/build.gradle"), "utf8");
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
const releaseGuide = readFileSync(join(root, "docs/releasing.md"), "utf8");

describe("release metadata", () => {
  it("keeps package and Android versions aligned", () => {
    expect(gradle).toContain(`versionName configuredVersionName ?: "${packageJson.version}"`);
    expect(gradle).toMatch(/versionCode configuredVersionCode \? configuredVersionCode\.toInteger\(\) : \d+\b/);
    expect(changelog).toContain(`## ${packageJson.version} - `);
  });

  it("documents the current release and Android version code", () => {
    const nextHeading = changelog.indexOf("\n## ", changelog.indexOf(`## ${packageJson.version} - `) + 1);
    const release = changelog.slice(
      changelog.indexOf(`## ${packageJson.version} - `),
      nextHeading === -1 ? undefined : nextHeading
    );
    expect(release).toContain("Raw");
    expect(release).toContain("TTY");
    expect(release).toContain("screenshot paste");
    expect(release).toMatch(/version code `\d+`/);
  });

  it("keeps the public release guide free of machine-specific home paths", () => {
    const machineSpecificHomePath = /(?:\/(?:home|Users)\/[^/\s]+|[A-Z]:\\Users\\[^\\\s]+)/i;
    for (const example of ["/home/alice/project", "/Users/alice/project", "C:\\Users\\alice\\project"]) {
      expect(example).toMatch(machineSpecificHomePath);
    }
    expect(releaseGuide).not.toMatch(machineSpecificHomePath);
    expect(releaseGuide).toContain("pnpm android:build:public");
  });
});
