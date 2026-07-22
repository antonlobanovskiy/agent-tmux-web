import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

type PackageJson = {
  dependencies: Record<string, string>;
};

const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8")
) as PackageJson;

describe("Raw terminal touch dependencies", () => {
  it("pins the coherent xterm build containing upstream touch gestures", () => {
    expect(packageJson.dependencies["@xterm/xterm"]).toBe("6.1.0-beta.291");
    expect(packageJson.dependencies["@xterm/addon-fit"]).toBe("0.12.0-beta.291");
    expect(packageJson.dependencies["@xterm/addon-web-links"]).toBe("0.13.0-beta.291");
  });
});
