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
    expect(css).toContain("env(safe-area-inset-top)");
    expect(mobileBlock).toContain("display: none");
    expect(mobileBlock).toContain("flex: 1 1 auto");
  });

  it("keeps the mobile tmux toolbar stable with compact view controls and a bell notify button", () => {
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");
    const mobileBlock = css.slice(css.indexOf("@media (max-width: 760px)"));

    expect(css).toContain(".tmux-view-menu");
    expect(css).toContain(".tmux-view-menu-content");
    expect(css).toContain(".tmux-notify-button");
    expect(mobileBlock).toContain("grid-template-columns: minmax(0, auto) 36px 36px minmax(0, 1fr) 36px");
    expect(mobileBlock).not.toContain("grid-template-columns: 36px 36px 36px 36px 36px 36px 36px minmax(0, 1fr)");
  });

  it("defines green yellow and red tmux session status dots", () => {
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");

    expect(css).toContain(".tmux-session-status-dot.green");
    expect(css).toContain(".tmux-session-status-dot.yellow");
    expect(css).toContain(".tmux-session-status-dot.red");
  });
});

describe("color theme CSS", () => {
  it("defines light and dark palettes with shared tokens", () => {
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");

    expect(css).toContain(":root[data-theme=\"light\"]");
    expect(css).toContain("color-scheme: dark");
    expect(css).toContain("color-scheme: light");
    expect(css).toContain("--surface-base");
    expect(css).toContain("background: var(--surface-base)");
    expect(css).toContain("color: var(--text-primary)");
  });
});
