import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function extractBalancedCssBlock(css: string, marker: string) {
  const start = css.indexOf(marker);
  const openBrace = css.indexOf("{", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(openBrace).toBeGreaterThan(start);

  let depth = 0;
  for (let index = openBrace; index < css.length; index += 1) {
    if (css[index] === "{") {
      depth += 1;
    } else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return { start, end: index + 1, text: css.slice(start, index + 1) };
      }
    }
  }

  throw new Error(`Unbalanced CSS block: ${marker}`);
}

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

  it("uses the workspace as the only output frame", () => {
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");
    const workspaceRule = css.match(/(?:^|})\s*\.tmux-workspace\s*\{([^}]*)\}/)?.[1] ?? "";
    const outputFrameRule = css.match(
      /(?:^|})\s*\.tmux-empty-session\s*,\s*\.tmux-output-shell\s*>\s*\.tmux-chat\s*,\s*\.tmux-output-shell\s*>\s*\.tmux-focus\s*,\s*\.tmux-output-shell\s*>\s*\.tmux-terminal\s*\{([^}]*)\}/
    )?.[1] ?? "";

    expect(workspaceRule).toMatch(/padding:\s*0\s*;/);
    expect(outputFrameRule).toMatch(/(?:^|;)\s*border:\s*0\s*(?:;|$)/);
    expect(outputFrameRule).toMatch(/(?:^|;)\s*border-radius:\s*0\s*(?:;|$)/);
    expect(outputFrameRule).toMatch(/(?:^|;)\s*box-shadow:\s*none\s*(?:;|$)/);
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

  it("lets only the mobile workspace fill the remaining viewport height", () => {
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");
    const mobileBlock = extractBalancedCssBlock(css, "@media (max-width: 760px)");
    const workspaceFlexRule = /\.tmux-workspace\s*\{[^}]*flex:\s*1 1 auto;/;
    const outsideMobileBlock = css.slice(0, mobileBlock.start) + css.slice(mobileBlock.end);

    expect(mobileBlock.text).toMatch(workspaceFlexRule);
    expect(outsideMobileBlock).not.toMatch(workspaceFlexRule);
    expect(css.match(new RegExp(workspaceFlexRule.source, "g"))).toHaveLength(1);
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

describe("current user guidance", () => {
  it("selects GUI before capturing mobile GUI marketing media", () => {
    const marketingCapture = readFileSync(join(process.cwd(), "scripts/capture-marketing.mjs"), "utf8");
    const navigation = marketingCapture.indexOf("await page.goto(demoUrl");
    const guiSelection = marketingCapture.indexOf('await chooseView(page, "GUI", signal);', navigation);
    const mobileGuiCapture = marketingCapture.indexOf('await capture(page, path.join(assetsDir, "mobile-gui.png"), signal);');

    expect(navigation).toBeGreaterThanOrEqual(0);
    expect(guiSelection).toBeGreaterThan(navigation);
    expect(mobileGuiCapture).toBeGreaterThan(guiSelection);
  });

  it("ships only the approved current marketing assets", () => {
    const marketingCapture = readFileSync(join(process.cwd(), "scripts/capture-marketing.mjs"), "utf8");
    const approved = [
      "agent-tmux-web-hero.png",
      "desktop-raw.png",
      "mobile-raw.png",
      "mobile-gui.png",
      "mobile-focus.png",
      "modes-overview.png",
      "agent-tmux-web-showcase-poster.png",
      "agent-tmux-web-showcase.mp4"
    ];
    const shipped = readdirSync(join(process.cwd(), "docs/assets")).sort();
    const marketing = readFileSync(join(process.cwd(), "docs/marketing.md"), "utf8");

    expect(shipped).toEqual([...approved].sort());
    for (const asset of approved) {
      expect(marketing).toContain(`docs/assets/${asset}`);
    }
    expect(marketingCapture).toContain("const SHOWCASE_FPS = 30;");
    expect(marketingCapture).toContain('\"-crf\", \"18\"');
    expect(marketingCapture).toContain('\"yuv420p\"');
    expect(marketingCapture).not.toContain("agent-tmux-web-showcase.gif");
  });

  it("resets Focus to its status and attention summary before capture", () => {
    const marketingCapture = readFileSync(join(process.cwd(), "scripts/capture-marketing.mjs"), "utf8");
    const focusSelection = marketingCapture.indexOf('await chooseView(page, "Focus", signal);');
    const focusReset = marketingCapture.indexOf(
      "document.querySelector('.tmux-focus')?.scrollTo({ top: 0 })",
      focusSelection
    );
    const focusCapture = marketingCapture.indexOf(
      'await capture(page, path.join(assetsDir, "mobile-focus.png"), signal);',
      focusSelection
    );

    expect(focusSelection).toBeGreaterThanOrEqual(0);
    expect(focusReset).toBeGreaterThan(focusSelection);
    expect(focusCapture).toBeGreaterThan(focusReset);
  });

  it("owns and monitors the loopback capture server", () => {
    const marketingCapture = readFileSync(join(process.cwd(), "scripts/capture-marketing.mjs"), "utf8");
    const portPreflight = marketingCapture.indexOf("await assertLoopbackPortAvailable(appPort);");
    const serverSpawn = marketingCapture.indexOf('spawn("node", ["dist/server/server/index.js"]');

    expect(marketingCapture).toMatch(/import\s+\{\s*createServer\s*\}\s+from\s+["']node:net["']/);
    expect(portPreflight).toBeGreaterThanOrEqual(0);
    expect(serverSpawn).toBeGreaterThan(portPreflight);
    expect(marketingCapture).toMatch(
      /const\s+serverFailure\s*=\s*monitorServer\(\s*server\s*,\s*generationAbortController\s*\)/
    );
    expect(marketingCapture).toMatch(
      /const\s+generationPromise\s*=\s*generateAndPublishAssets\(\s*generationAbortController\.signal\s*\)/
    );
    expect(marketingCapture).toMatch(
      /Promise\.race\(\s*\[\s*generationPromise\s*,\s*serverFailure\s*\]\s*\)/
    );
    expect(marketingCapture).toMatch(/(?:server|child)\.once\(\s*["']exit["']/);
  });

  it("validates staged assets before atomic publication and preserves reviewed output on failure", () => {
    const marketingCapture = readFileSync(join(process.cwd(), "scripts/capture-marketing.mjs"), "utf8");
    const validation = marketingCapture.indexOf("await validateStagedAssets();");
    const publication = marketingCapture.indexOf("await publishAssetsAtomically();");

    expect(marketingCapture).toMatch(/const\s+publishedAssetsDir\s*=\s*path\.join\(\s*root\s*,\s*["']docs["']\s*,\s*["']assets["']\s*\)/);
    expect(marketingCapture).toMatch(/const\s+stagingAssetsDir\s*=\s*path\.join\([^\n]+\.assets-staging-/);
    expect(marketingCapture).toMatch(/const\s+backupAssetsDir\s*=\s*path\.join\([^\n]+\.assets-backup-/);
    expect(validation).toBeGreaterThanOrEqual(0);
    expect(publication).toBeGreaterThan(validation);
    expect(marketingCapture).toMatch(/rename\(\s*publishedAssetsDir\s*,\s*backupAssetsDir\s*\)/);
    expect(marketingCapture).toMatch(/rename\(\s*stagingAssetsDir\s*,\s*publishedAssetsDir\s*\)/);
    expect(marketingCapture).not.toMatch(/rm\(\s*publishedAssetsDir\s*,/);
  });

  it("presents the reviewed README visual hierarchy with accurate alt text", () => {
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
    const introductionClosing = "tabs without killing the work.";
    const introductionEnd = readme.indexOf(introductionClosing);

    expect(introductionEnd).toBeGreaterThanOrEqual(0);
    expect(readme.slice(introductionEnd + introductionClosing.length)).toMatch(
      /^\s*\[!\[Agent Tmux Web hero with desktop Raw terminal session\]\(\.\/docs\/assets\/agent-tmux-web-hero\.png\)\]\(\.\/docs\/assets\/agent-tmux-web-showcase\.mp4\)/
    );
    expect(readme).toMatch(
      /!\[Desktop Raw terminal session\]\(\.\/docs\/assets\/desktop-raw\.png\)/
    );
    expect(readme).toMatch(
      /\[!\[Agent Tmux Web showcase poster with desktop Raw terminal session\]\(\.\/docs\/assets\/agent-tmux-web-showcase-poster\.png\)\]\(\.\/docs\/assets\/agent-tmux-web-showcase\.mp4\)/
    );

    const productViewsStart = readme.indexOf("## Product Views");
    const showcaseStart = readme.indexOf("### Professional showcase", productViewsStart);
    expect(productViewsStart).toBeGreaterThan(introductionEnd);
    expect(showcaseStart).toBeGreaterThan(productViewsStart);

    const productViews = readme.slice(productViewsStart, showcaseStart);
    const mobileRow = productViews.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
    const mobileImages = [...mobileRow.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
    const readAttribute = (image: string, name: string) =>
      image.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];

    expect(mobileImages).toHaveLength(3);
    expect(
      mobileImages.map((image) => ({
        src: readAttribute(image, "src"),
        alt: readAttribute(image, "alt")
      }))
    ).toEqual([
      { src: "./docs/assets/mobile-raw.png", alt: "Mobile Raw terminal session" },
      { src: "./docs/assets/mobile-gui.png", alt: "Mobile GUI transcript view" },
      { src: "./docs/assets/mobile-focus.png", alt: "Mobile Focus conversation view" }
    ]);
    expect(readme).not.toMatch(/<video\b[^>]*\bautoplay(?:\s|=|>)/i);
    expect(readme).not.toMatch(/mobile-tty|View: TTY|Terminal.*Details/);
  });

  it("captures marketing PNGs at their approved native dimensions", () => {
    const marketingCapture = readFileSync(join(process.cwd(), "scripts/capture-marketing.mjs"), "utf8");
    const captureContext = marketingCapture.slice(
      marketingCapture.indexOf("const captureContext"),
      marketingCapture.indexOf("const page", marketingCapture.indexOf("const captureContext"))
    );
    const heroRenderer = marketingCapture.slice(
      marketingCapture.indexOf("async function renderHero"),
      marketingCapture.indexOf("async function renderModesOverview")
    );

    expect(marketingCapture).toMatch(/const\s+HERO_WIDTH\s*=\s*1600\s*;/);
    expect(marketingCapture).toMatch(/const\s+HERO_HEIGHT\s*=\s*900\s*;/);
    expect(marketingCapture).toMatch(/const\s+DESKTOP_WIDTH\s*=\s*1440\s*;/);
    expect(marketingCapture).toMatch(/const\s+DESKTOP_HEIGHT\s*=\s*900\s*;/);
    expect(marketingCapture).toMatch(/const\s+MOBILE_WIDTH\s*=\s*390\s*;/);
    expect(marketingCapture).toMatch(/const\s+MOBILE_HEIGHT\s*=\s*844\s*;/);
    expect(captureContext).toMatch(/deviceScaleFactor\s*:\s*1\b/);
    expect(captureContext).not.toMatch(/deviceScaleFactor\s*:\s*2\b/);
    expect(heroRenderer).toMatch(/setViewport\(\s*page\s*,\s*HERO_WIDTH\s*,\s*HERO_HEIGHT\s*\)/);
  });

  it("crossfades overlapping showcase scenes with cubic eased restrained motion", () => {
    const marketingCapture = readFileSync(join(process.cwd(), "scripts/capture-marketing.mjs"), "utf8");

    expect(marketingCapture).toMatch(/const\s+TRANSITION_FRAMES\s*=\s*\d+\s*;/);
    expect(marketingCapture).toMatch(/querySelectorAll\(\s*["']\.scene-layer["']\s*\)/);
    expect(marketingCapture).toMatch(/incomingOpacity\s*=\s*ease\s*\(/);
    expect(marketingCapture).toMatch(/outgoingOpacity\s*=\s*1\s*-\s*incomingOpacity/);
    expect(marketingCapture).toMatch(/--scene-opacity["']\s*,\s*String\(\s*outgoingOpacity\s*\)/);
    expect(marketingCapture).toMatch(/--scene-opacity["']\s*,\s*String\(\s*incomingOpacity\s*\)/);
    expect(marketingCapture).toMatch(/outgoingCopyOpacity\s*=\s*1\s*-\s*ease\s*\(/);
    expect(marketingCapture).toMatch(/incomingCopyOpacity\s*=\s*ease\s*\(/);
    expect(marketingCapture).toMatch(/--copy-opacity["']\s*,\s*String\(\s*outgoingCopyOpacity\s*\)/);
    expect(marketingCapture).toMatch(/--copy-opacity["']\s*,\s*String\(\s*incomingCopyOpacity\s*\)/);
    expect(marketingCapture).toMatch(/0\.99\s*\+\s*0\.02\s*\*\s*eased/);
    expect(marketingCapture).not.toMatch(/--visibility["']\s*,\s*["']1["']/);
  });

  it("describes only the current Agent Tmux views while retaining OpenCode's Linear TTY mode", () => {
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
    const marketing = readFileSync(join(process.cwd(), "docs/marketing.md"), "utf8");
    const aiSetup = readFileSync(join(process.cwd(), "AI_SETUP.md"), "utf8");
    const marketingCapture = readFileSync(join(process.cwd(), "scripts/capture-marketing.mjs"), "utf8");
    const tmuxTools = readFileSync(join(process.cwd(), "src/shared/tmuxTools.ts"), "utf8");
    const fullUiMode = tmuxTools.slice(
      tmuxTools.indexOf('id: "full-tui"'),
      tmuxTools.indexOf('id: "mini-ui"')
    );

    expect(readme.replaceAll("Linear TTY", "")).not.toMatch(/\bTTY\b/);
    expect(readme).not.toContain("`Terminal` and `Details` tabs");
    expect(readme).not.toContain("modes-overview.png");
    expect(marketing).not.toMatch(/\bTTY\b|GUI\/TTY/);
    expect(marketing).not.toContain("mobile-tty.png");
    expect(aiSetup).not.toMatch(/\bTTY\b/);
    expect(marketingCapture).not.toMatch(/\bTTY\b|mobile-tty\.png/);
    expect(fullUiMode).not.toMatch(/\bTTY\b|details panel/i);
    expect(readme).toContain("Linear TTY");
    expect(tmuxTools).toContain('label: "Linear TTY"');
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
