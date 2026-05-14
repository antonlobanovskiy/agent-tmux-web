import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("responsive mobile CSS", () => {
  it("uses a single-screen terminal layout on mobile", () => {
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");
    const mobileBlock = css.slice(css.indexOf("@media (max-width: 760px)"));

    expect(mobileBlock).toContain("html,");
    expect(mobileBlock).toContain("body,");
    expect(mobileBlock).toContain("#root");
    expect(mobileBlock).toContain("overflow: hidden");
    expect(mobileBlock).toContain("height: 100dvh");
    expect(mobileBlock).toContain("display: none");
    expect(mobileBlock).toContain("flex: 1 1 auto");
  });
});
