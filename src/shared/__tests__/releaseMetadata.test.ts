import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  version: string;
  scripts: Record<string, string>;
};
const gradle = readFileSync(join(root, "android/app/build.gradle"), "utf8");
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
const releaseGuide = readFileSync(join(root, "docs/releasing.md"), "utf8");

describe("release metadata", () => {
  it("keeps package and Android versions aligned", () => {
    const versionCode = gradle.match(/versionCode configuredVersionCode \? configuredVersionCode\.toInteger\(\) : (\d+)\b/)?.[1];
    expect(gradle).toContain(`versionName configuredVersionName ?: "${packageJson.version}"`);
    expect(versionCode).toMatch(/^\d+$/);
    expect(packageJson.scripts["android:build:public"]).toContain(`-PagentTmuxVersionName=${packageJson.version}`);
    expect(packageJson.scripts["android:build:public"]).toContain(`-PagentTmuxVersionCode=${versionCode}`);
    expect(packageJson.scripts["android:build:play"]).toContain(`-PagentTmuxVersionName=${packageJson.version}`);
    expect(packageJson.scripts["android:build:play"]).toContain(`-PagentTmuxVersionCode=${versionCode}`);
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

  it("keeps tracked text free of maintainer-specific paths and addresses", () => {
    const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: root })
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
    const leaks = trackedFiles.flatMap((filePath) => {
      const absolutePath = join(root, filePath);
      if (!existsSync(absolutePath)) {
        return [];
      }
      const content = readFileSync(absolutePath);
      if (content.includes(0)) {
        return [];
      }
      return /\/home\/antonlobanovskiy|100\.67\.212\.112/.test(content.toString("utf8")) ? [filePath] : [];
    });
    expect(leaks).toEqual([]);
  });
});
