import { existsSync, readFileSync } from "node:fs";
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
    expect(app).toContain('raw: "Raw"');
    expect(mobileBlock).toContain("max-width: 150px");
    expect(mobileBlock).toContain("grid-template-columns: minmax(0, auto) 36px 36px minmax(0, 1fr) 36px");
    expect(mobileBlock).not.toContain("grid-template-columns: 36px 36px 36px 36px 36px 36px 36px minmax(0, 1fr)");
  });

  it("makes Raw the default terminal view without TTY-only code", () => {
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");

    expect(app).not.toContain('regular: "TTY"');
    expect(app).not.toContain('selectTmuxViewMode("regular")');
    expect(app).not.toContain("TmuxTtyView");
    expect(app).toContain("Reconnect");
    expect(app).toContain("shouldShowRawTerminalShortcuts");
    expect(app).toContain("WebLinksAddon");
    expect(app).toContain("createRawTerminalSelectionHandler");
    expect(app).toContain('role="menuitemradio"');
    expect(css).not.toContain(".tmux-opencode-tabs");
  });

  it("routes destroy replacements through Raw without stale session updates", () => {
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");

    expect(app).toContain("function applyDestroyedSessionReplacement");
    expect(app.match(/applyDestroyedSessionReplacement\(nextSession\);/g)).toHaveLength(2);
    expect(app).toContain("selectTmuxSession(nextSession.name)");
    expect(app).toContain("selectedTmuxRef.current !== targetSession");
  });

  it("uses current-operation guards for capture and CLI launch responses", () => {
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");

    expect(app).toContain("shouldApplyTmuxCapture({");
    expect(app).toContain("shouldApplyTmuxToolLaunch({");
    expect(app).toContain("Promise<boolean>");
    expect(app).toMatch(/\.then\(\(applied\) => \{\s+if \(applied && isCurrentManualCaptureOwner\(owner\)\) \{\s+setTerminalStatus\(`synced \$\{session\}`\)/);
  });

  it("centralizes capture ownership and cancels manual sync safely", () => {
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");
    const captureStart = app.indexOf("const captureTmux");
    const captureEnd = app.indexOf("useEffect(() => {", captureStart);
    const captureBlock = app.slice(captureStart, captureEnd);
    const syncStart = app.indexOf("function syncOrReconnectTmux");
    const syncEnd = app.indexOf("function showTmuxCopyNotice", syncStart);
    const syncBlock = app.slice(syncStart, syncEnd);
    const requestAllocation = "const requestId = ++tmuxCaptureRequestIdRef.current";

    expect(captureBlock).toContain("shouldAdmitTmuxCapture({");
    expect(captureBlock.indexOf("shouldAdmitTmuxCapture({")).toBeLessThan(captureBlock.indexOf(requestAllocation));
    expect(app).toContain('source: "session"');
    expect(app).toContain('source: "poll"');
    expect(app).toContain('source: "view"');
    expect(app).toContain('source: "follow"');
    expect(syncBlock).toContain('source: "manual"');
    expect(syncBlock).toContain("new AbortController()");
    expect(syncBlock).toContain("clearTmuxFollowTimers(tmuxFollowTimersRef)");
    expect(syncBlock).toContain("TMUX_MANUAL_CAPTURE_TIMEOUT_MS");
    expect(syncBlock).toContain("sync timed out");
    expect(syncBlock).toMatch(/\.finally\(\(\) => \{\s+releaseManualCapture\(owner\);/);
    expect(app).toContain("isCurrentManualCaptureOwner(owner)");
    expect(app).toContain("cancelManualCapture(false)");
    expect(app).toContain("aria-busy={manualCaptureActive}");
  });

  it("renders and gates controls for the no-session state", () => {
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");

    expect(app).toContain("!selectedTmux ? (");
    expect(app).toContain('className="tmux-empty-session"');
    expect(app).toContain("No tmux session selected");
    expect(app).toContain("disabled={!selectedTmux || manualCaptureActive}");
    expect(app).toContain("const sessionSelected = Boolean(selectedTmux)");
    expect(app).toContain("showTmuxJumpToLatest");
    expect(app).toContain("{showTmuxJumpToLatest && (");
  });

  it("guards queued Raw selection status callbacks after cleanup", () => {
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");

    expect(app).toContain("let rawTerminalEffectActive = true;");
    expect(app).toMatch(/onCopied: \(\) => \{\s+if \(rawTerminalEffectActive\) \{\s+setTerminalStatus\("Copied selection"\)/);
    expect(app).toMatch(/onError: \(message\) => \{\s+if \(rawTerminalEffectActive\) \{\s+setTerminalStatus\(message\)/);
    expect(app).toContain("rawTerminalEffectActive = false;");
  });

  it("removes redundant GUI state and orphaned TTY output sources", () => {
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");

    expect(app).not.toContain("tmuxGuiActive");
    expect(app).not.toContain("setTmuxGuiActive");
    expect(existsSync(join(process.cwd(), "src/client/tmuxOutputLines.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "src/client/__tests__/tmuxOutputLines.test.tsx"))).toBe(false);
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
