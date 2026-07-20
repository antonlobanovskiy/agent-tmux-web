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
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");
    const mobileBlock = css.slice(css.indexOf("@media (max-width: 760px)"));

    expect(css).toContain(".tmux-view-menu");
    expect(css).toContain(".tmux-view-menu-content");
    expect(css).toContain(".tmux-view-menu-caret");
    expect(css).toContain(".tmux-notify-button");
    expect(app).toContain("View:");
    expect(app).toContain("regular: \"TTY\"");
    expect(mobileBlock).toContain("max-width: 150px");
    expect(mobileBlock).toContain("grid-template-columns: minmax(0, auto) 36px 36px minmax(0, 1fr) 36px");
    expect(mobileBlock).not.toContain("grid-template-columns: 36px 36px 36px 36px 36px 36px 36px minmax(0, 1fr)");
  });

  it("does not reserve terminal height for the removed agent state viewer", () => {
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");

    expect(css).not.toContain(".tmux-agent-strip");
    expect(app).not.toContain("TmuxAgentSummaryStrip");
  });

  it("defines green yellow and red tmux session status dots", () => {
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");

    expect(css).toContain(".tmux-session-status-dot.green");
    expect(css).toContain(".tmux-session-status-dot.yellow");
    expect(css).toContain(".tmux-session-status-dot.red");
  });

  it("separates OpenCode's sidebar and uses tabs on mobile", () => {
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");
    const mobileBlock = css.slice(css.indexOf("@media (max-width: 760px)"));

    expect(css).toContain(".tmux-output.tmux-opencode-layout");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) minmax(280px, 336px)");
    expect(css).toContain(".tmux-opencode-sidebar");
    expect(mobileBlock).toContain(".tmux-opencode-tabs");
    expect(mobileBlock).toContain(".tmux-opencode-terminal.mobile-active");
  });

  it("builds a dense desktop workbench while retaining the mobile terminal layout", () => {
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");
    const mobileBlock = css.slice(css.indexOf("@media (max-width: 760px)"));

    expect(app).toContain('className="tmux-app-toolbar"');
    expect(app).toContain('className="tmux-rail-section-title">Sessions');
    expect(app).toContain('className="tmux-rail-section-title">New Session');
    expect(app).toContain('className="tmux-rail-section-title">CLI Launcher');
    expect(app).toContain('className="tmux-connection-status"');
    expect(css).toContain(".tmux-app-toolbar");
    expect(css).toContain("grid-template-columns: 260px minmax(0, 1fr)");
    expect(css).toContain("border-radius: 2px");
    expect(mobileBlock).toContain(".tmux-app-toolbar");
    expect(mobileBlock).toContain("grid-template-columns: minmax(0, auto) 36px 36px minmax(0, 1fr) 36px");
    expect(mobileBlock).toContain(".tmux-menu.open");
  });

  it("keeps the desktop grid through the intermediate breakpoint", () => {
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");
    const intermediateBlock = css.slice(
      css.indexOf("@media (max-width: 1120px)"),
      css.indexOf("@media (max-width: 760px)")
    );

    expect(intermediateBlock).not.toContain(".tmux-panel");
    expect(intermediateBlock).not.toContain(".tmux-control-rail");
    expect(intermediateBlock).not.toContain(".tmux-workspace");
  });

  it("labels and groups launcher modes by interface permissions and options", () => {
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");

    expect(app).toContain('label: "UI Mode"');
    expect(app).toContain('label: "Permission Mode"');
    expect(app).toContain('label: "Options"');
    expect(app).toContain('role="group"');
    expect(app).toContain("aria-labelledby");
    expect(app).not.toContain("Output Mode");
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

  it("uses dark workbench surfaces for tmux utility controls", () => {
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");
    const utilityRule = css.match(
      /\.tmux-compact-bar button,\n\.tmux-terminal-toolbar button,\n\.tmux-view-menu summary,\n\.tmux-actions button,\n\.tmux-tool-actions button,\n\.tmux-send button,\n\.tmux-soft-keys button \{([^}]*)\}/
    )?.[1] ?? "";

    expect(utilityRule).toContain("background: var(--surface-control)");
    expect(utilityRule).toContain("color: var(--text-control)");
    expect(utilityRule).toContain("border: 1px solid var(--border-strong)");
  });
});
