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

  it("keeps the mobile tmux toolbar stable with a direct view toggle and bell notify button", () => {
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");
    const mobileBlock = css.slice(css.indexOf("@media (max-width: 760px)"));

    expect(css).toContain(".tmux-view-menu");
    expect(css).toContain(".tmux-view-menu-content");
    expect(css).toContain(".tmux-view-menu-caret");
    expect(css).toContain(".tmux-notify-button");
    expect(app).toContain("Switch to ${terminalActive ? \"TTY\" : \"Raw\"} view");
    expect(app).toContain('className="tmux-view-toggle"');
    expect(app).not.toContain("tmux-view-picker-content");
    expect(app).toContain('raw: "Raw"');
    expect(app).toContain("hasAndroidConnectionSettings");
    expect(app).toContain("openAndroidConnectionSettings");
    expect(app).toContain(">App</span>");
    expect(app).toContain(">Connection settings</span>");
    expect(mobileBlock).toContain("max-width: 150px");
    expect(mobileBlock).toContain("grid-template-columns: minmax(0, auto) 36px 36px minmax(0, 1fr) 36px");
    expect(mobileBlock).not.toContain("grid-template-columns: 36px 36px 36px 36px 36px 36px 36px minmax(0, 1fr)");
  });

  it("replaces the floating Android Set button with bridge and native recovery paths", () => {
    const mainActivity = readFileSync(join(
      process.cwd(),
      "android/app/src/main/java/com/agenttmux/web/MainActivity.java"
    ), "utf8");

    expect(mainActivity).not.toContain("addSettingsButton");
    expect(mainActivity).not.toContain('setText("Set")');
    expect(mainActivity).toContain("new AgentNotificationBridge(this, this::showSetup)");
    expect(mainActivity).toContain("request.isForMainFrame()");
    expect(mainActivity).toContain("public void onReceivedError");
    expect(mainActivity).toMatch(/if \(!serverUrl\(\)\.isEmpty\(\)\) \{\s+showSetup\(\);/);
  });

  it("defaults to TTY while retaining Raw interaction and per-session view preferences", () => {
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");

    expect(app).not.toContain('regular: "TTY"');
    expect(app).not.toContain('selectTmuxViewMode("regular")');
    expect(app).toContain("TmuxTtyView");
    expect(app).toContain("FALLBACK_TMUX_VIEW_MODE");
    expect(app).toContain("rememberTmuxViewMode(selectedTmux, mode)");
    expect(app).toContain("Remember per session");
    expect(app).toContain("Use default");
    expect(app).toContain('onClick={refreshTmux}');
    expect(app).toContain("shouldShowRawTerminalShortcuts");
    expect(app).toContain("WebLinksAddon");
    expect(app).toContain("createRawTerminalSelectionHandler");
    expect(app).toContain("installRawTerminalGestureGuard(node)");
    expect(app).toContain("removeRawTerminalGestureGuard()");
    expect(app).toContain("installRawTerminalInputGuard(terminal.textarea, terminal)");
    expect(app).toContain('role="menuitemradio"');
    expect(css).toContain(".tmux-opencode-tabs");
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

  it("warms and applies per-session captures before entering TTY", () => {
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");

    expect(app).toContain("tmuxCaptureCacheRef");
    expect(app).toContain("prefetchTmuxCapture");
    expect(app).toContain("applyCachedTmuxCapture(selectedTmux)");
    expect(app).toContain("window.setInterval(refreshCache, TMUX_CAPTURE_POLL_INTERVAL_MS)");
    expect(app.match(/clientWidth: String\(resolveTmuxCaptureClientWidth\(\)\)/g)).toHaveLength(2);
    expect(app).toContain('ref={tmuxCaptureWidthRef}');
    expect(app).toContain("tmuxCaptureWidthRef.current?.clientWidth");
    expect(app).toContain("TMUX_CAPTURE_HISTORY_LINES");
    expect(app).not.toContain("const TMUX_CAPTURE_HISTORY_LINES = 1000");
  });

  it("invalidates delayed session and launcher work when navigation changes", () => {
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");
    const sessionStart = app.indexOf("function selectTmuxSession");
    const sessionEnd = app.indexOf("function tmuxStatusForSession", sessionStart);
    const viewStart = app.indexOf("function selectTmuxViewMode");
    const viewEnd = app.indexOf("function selectColorTheme", viewStart);

    expect(app.slice(sessionStart, sessionEnd)).toContain("clearTmuxFollowTimers(tmuxFollowTimersRef)");
    expect(app.slice(viewStart, viewEnd)).toContain("tmuxToolLaunchRequestIdRef.current += 1");
  });

  it("centralizes capture ownership and cancels manual sync safely", () => {
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");
    const captureStart = app.indexOf("const captureTmux");
    const captureEnd = app.indexOf("useEffect(() => {", captureStart);
    const captureBlock = app.slice(captureStart, captureEnd);
    const syncStart = app.indexOf("function refreshTmux");
    const syncEnd = app.indexOf("function closeTmuxSettingsMenu", syncStart);
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
    expect(app).toContain("disabled={manualCaptureActive}");
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

  it("removes GUI and Focus runtime state while retaining TTY output sources", () => {
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");

    expect(app).not.toContain("tmuxGuiActive");
    expect(app).not.toContain("setTmuxGuiActive");
    expect(app).not.toContain("tmuxFocusActive");
    expect(app).not.toContain("TmuxChatView");
    expect(app).not.toContain("TmuxFocusView");
    expect(existsSync(join(process.cwd(), "src/client/tmuxOutputLines.tsx"))).toBe(true);
    expect(existsSync(join(process.cwd(), "src/client/__tests__/tmuxOutputLines.test.tsx"))).toBe(true);
  });

  it("does not reserve terminal height for the removed agent state viewer", () => {
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");

    expect(css).not.toContain(".tmux-agent-strip");
    expect(app).not.toContain("TmuxAgentSummaryStrip");
  });

  it("defines semantic tmux session status lights", () => {
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");

    expect(css).toContain(".tmux-session-status-dot.green");
    expect(css).toContain(".tmux-session-status-dot.amber");
    expect(css).toContain(".tmux-session-status-dot.red");
    expect(css).toContain(".tmux-session-status-dot.gray");
  });

  it("builds a dense desktop workbench while retaining the mobile terminal layout", () => {
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");
    const app = readFileSync(join(process.cwd(), "src/client/App.tsx"), "utf8");
    const desktopBlock = extractBalancedCssBlock(css, "@media (min-width: 761px)");
    const mobileBlock = css.slice(css.indexOf("@media (max-width: 760px)"));

    expect(app).toContain('className="tmux-app-toolbar"');
    expect(app).toContain('className="tmux-rail-section-title">Sessions');
    expect(app).toContain('className="tmux-rail-section-title">New Session');
    expect(app).toContain('className="tmux-rail-section-title">CLI Launcher');
    expect(app).toContain('className="tmux-connection-status"');
    expect(css).toContain(".tmux-app-toolbar");
    expect(css).toContain("grid-template-columns: 260px minmax(0, 1fr)");
    expect(css).toContain("border-radius: 2px");
    expect(desktopBlock.text).toContain(".tmux-compact-bar .tmux-session-menu-button");
    expect(desktopBlock.text).toContain("display: none");
    expect(mobileBlock).toContain(".tmux-app-toolbar");
    expect(mobileBlock).toContain("grid-template-columns: minmax(0, auto) 36px 36px minmax(0, 1fr) 36px");
    expect(mobileBlock).toContain(".tmux-menu.open");
  });

  it("uses the workspace as the only output frame", () => {
    const css = readFileSync(join(process.cwd(), "src/client/styles.css"), "utf8");
    const workspaceRule = css.match(/(?:^|})\s*\.tmux-workspace\s*\{([^}]*)\}/)?.[1] ?? "";
    const outputFrameRule = css.match(
      /(?:^|})\s*\.tmux-empty-session\s*,\s*\.tmux-output-shell\s*>\s*\.tmux-output\s*,\s*\.tmux-output-shell\s*>\s*\.tmux-terminal\s*\{([^}]*)\}/
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
  it("captures only TTY and Raw product views", () => {
    const marketingCapture = readFileSync(join(process.cwd(), "scripts/capture-marketing.mjs"), "utf8");
    expect(marketingCapture).toContain('await chooseView(page, "TTY", signal);');
    expect(marketingCapture).toContain('await chooseView(page, "Raw", signal);');
    expect(marketingCapture).not.toContain("mobile-gui.png");
    expect(marketingCapture).not.toContain("mobile-focus.png");
  });

  it("ships only the approved current marketing assets", () => {
    const marketingCapture = readFileSync(join(process.cwd(), "scripts/capture-marketing.mjs"), "utf8");
    const approved = [
      "agent-tmux-web-hero.png",
      "desktop-tty.png",
      "mobile-tty.png",
      "mobile-raw.png",
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

  it("fails fast when showcase image preloading fails", () => {
    const marketingCapture = readFileSync(join(process.cwd(), "scripts/capture-marketing.mjs"), "utf8");
    const showcaseRenderer = marketingCapture.slice(
      marketingCapture.indexOf("async function renderShowcaseAssets"),
      marketingCapture.indexOf("function buildHeroHtml")
    );

    expect(marketingCapture).toContain("window.assetsError = null;");
    expect(marketingCapture).toContain("window.assetsError = error instanceof Error ? error.message : String(error);");
    expect(marketingCapture).toMatch(/\.finally\(\(\) => \{\s*window\.assetsReady = true;\s*\}\)/);
    expect(showcaseRenderer).toContain("const assetsError = await page.evaluate(() => window.assetsError);");
    expect(showcaseRenderer).toContain("Showcase asset preload failed");
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

  it("recovers stale cross-PID capture directories before creating current staging", () => {
    const marketingCapture = readFileSync(join(process.cwd(), "scripts/capture-marketing.mjs"), "utf8");
    const recovery = marketingCapture.indexOf("await recoverStaleAssetDirectories(");
    const currentStaging = marketingCapture.indexOf("await mkdir(framesDir, { recursive: true });");

    expect(recovery).toBeGreaterThanOrEqual(0);
    expect(currentStaging).toBeGreaterThan(recovery);
    expect(marketingCapture).toContain("validateAssetDirectory");
  });

  it("aborts capture on SIGINT and SIGTERM before shared cleanup sets signal exit status", () => {
    const marketingCapture = readFileSync(join(process.cwd(), "scripts/capture-marketing.mjs"), "utf8");

    expect(marketingCapture).toMatch(/process\.once\(\s*["']SIGINT["']/);
    expect(marketingCapture).toMatch(/process\.once\(\s*["']SIGTERM["']/);
    expect(marketingCapture).toMatch(/generationAbortController\.abort\(/);
    expect(marketingCapture).toMatch(/handleSIGINT\s*:\s*false/);
    expect(marketingCapture).toMatch(/handleSIGTERM\s*:\s*false/);
    expect(marketingCapture).toMatch(/SIGINT\s*:\s*130/);
    expect(marketingCapture).toMatch(/SIGTERM\s*:\s*143/);
    expect(marketingCapture).toMatch(/process\.exitCode\s*=\s*SIGNAL_EXIT_CODES\[interruptedSignal\]/);

    const cleanup = marketingCapture.slice(marketingCapture.indexOf("} finally {"));
    expect(cleanup).toContain("await browser?.close()");
    expect(cleanup).toContain("await stopServer(server)");
    expect(cleanup).toContain("await rm(stagingAssetsDir");
    expect(cleanup).toContain("await rm(backupAssetsDir");
  });

  it("ignores interrupted marketing staging and backup directories", () => {
    const gitignore = readFileSync(join(process.cwd(), ".gitignore"), "utf8").split(/\r?\n/);

    expect(gitignore).toContain("docs/.assets-staging-*");
    expect(gitignore).toContain("docs/.assets-backup-*");
  });

  it("requests codec types and validates the complete showcase stream list", () => {
    const marketingCapture = readFileSync(join(process.cwd(), "scripts/capture-marketing.mjs"), "utf8");

    expect(marketingCapture).toContain("stream=codec_type,codec_name,pix_fmt,width,height,r_frame_rate,avg_frame_rate");
    expect(marketingCapture).toContain("assertShowcaseMetadata(video");
  });

  it("presents the reviewed README visual hierarchy with accurate alt text", () => {
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
    const introductionClosing = "tabs without killing the work.";
    const introductionEnd = readme.indexOf(introductionClosing);

    expect(introductionEnd).toBeGreaterThanOrEqual(0);
    expect(readme.slice(introductionEnd + introductionClosing.length)).toMatch(
      /^\s*\[!\[Agent Tmux Web hero with desktop TTY session\]\(\.\/docs\/assets\/agent-tmux-web-hero\.png\)\]\(\.\/docs\/assets\/agent-tmux-web-showcase\.mp4\)/
    );
    expect(readme).toMatch(
      /!\[Desktop TTY session with OpenCode stream and details\]\(\.\/docs\/assets\/desktop-tty\.png\)/
    );
    expect(readme).toMatch(
      /\[!\[Agent Tmux Web showcase poster with desktop TTY session\]\(\.\/docs\/assets\/agent-tmux-web-showcase-poster\.png\)\]\(\.\/docs\/assets\/agent-tmux-web-showcase\.mp4\)/
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

    expect(mobileImages).toHaveLength(2);
    expect(
      mobileImages.map((image) => ({
        src: readAttribute(image, "src"),
        alt: readAttribute(image, "alt")
      }))
    ).toEqual([
      { src: "./docs/assets/mobile-tty.png", alt: "Mobile TTY stream view" },
      { src: "./docs/assets/mobile-raw.png", alt: "Mobile Raw terminal session" }
    ]);
    expect(readme).not.toMatch(/<video\b[^>]*\bautoplay(?:\s|=|>)/i);
    expect(readme).not.toMatch(/View: TTY/);
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

  it("documents TTY as a view without exposing OpenCode's removed mini UI mode", () => {
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
    const marketing = readFileSync(join(process.cwd(), "docs/marketing.md"), "utf8");
    const aiSetup = readFileSync(join(process.cwd(), "AI_SETUP.md"), "utf8");
    const marketingCapture = readFileSync(join(process.cwd(), "scripts/capture-marketing.mjs"), "utf8");
    const tmuxTools = readFileSync(join(process.cwd(), "src/shared/tmuxTools.ts"), "utf8");
    expect(readme).toMatch(/TTY mode|`TTY`/);
    expect(readme).not.toContain("modes-overview.png");
    expect(marketing).toMatch(/\bTTY\b/);
    expect(marketing).toContain("mobile-tty.png");
    expect(aiSetup).toMatch(/\bTTY\b/);
    expect(marketingCapture).toMatch(/\bTTY\b/);
    expect(marketingCapture).toContain("mobile-tty.png");
    expect(readme).not.toContain("Linear TTY");
    expect(tmuxTools).not.toMatch(/mini-ui|Linear TTY|--mini|--replay-limit/);
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
