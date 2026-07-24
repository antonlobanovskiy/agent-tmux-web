# Raw Terminal Mobile Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the touch software keyboard only after a stationary tap on Raw's visible cursor row while keeping scrolling, output taps, long presses, soft keys, and desktop click-to-type correct.

**Architecture:** Remove application pointerdown focus side effects and classify intentional touch input from xterm's pinned `-xterm-gesturetap` event. A pure `rawTerminalMode.ts` helper maps page geometry and xterm buffer state to a cursor-row decision; `App.tsx` owns listener lifecycle and leaves desktop mouse focus to xterm.

**Tech Stack:** React 19, TypeScript 5.9, xterm 6.1.0-beta.291, Vitest 4, Vite 7, Playwright 1.59, Android WebView/Gradle, tmux

## Global Constraints

- A short stationary touch tap focuses xterm only when it lands on the active cursor row and the live bottom page is visible.
- Output taps, touch drags, long presses, and Raw soft keys must not focus `.xterm-helper-textarea`.
- Mobile/touch-first Raw initialization and WebSocket connection must not focus xterm automatically.
- Desktop initialization and mouse click-to-type must remain functional; xterm's native `mousedown` owns mouse focus.
- GUI and Focus visible `send keys + Enter` behavior must not change.
- Keep `@xterm/xterm@6.1.0-beta.291`, `@xterm/addon-fit@0.12.0-beta.291`, and `@xterm/addon-web-links@0.13.0-beta.291` exactly pinned.
- Do not change Raw touch scrolling, selection, links, tmux mouse reporting, or `rawTerminalGestureGuard.ts`.
- Do not expose or commit the private service URL, token, Android local configuration, signing material, or private APK.
- Do not restart the private service or stop existing tmux sessions.
- The next private APK is `0.1.24-private.2` with version code `20027`; it is never a public GitHub release.

---

### Task 1: Cursor-Row Tap Policy

**Files:**
- Modify: `src/client/rawTerminalMode.ts`
- Test: `src/client/__tests__/rawTerminalMode.test.ts`

**Interfaces:**
- Consumes: finite page coordinates, xterm screen geometry, `terminal.rows`, and `terminal.buffer.active` cursor/viewport values.
- Produces: `shouldFocusRawTerminalTap(context: RawTerminalTapContext): boolean` for `App.tsx` in Task 2.

- [ ] **Step 1: Write failing cursor-row policy tests**

Update the import and append these tests to `src/client/__tests__/rawTerminalMode.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  shouldFocusRawTerminalTap,
  shouldShowRawTerminalShortcuts,
  shouldShowTmuxJumpToLatest,
  shouldShowTmuxSendForm
} from "../rawTerminalMode.js";

const cursorTap = {
  baseY: 12,
  cursorY: 3,
  pageY: 170,
  rows: 4,
  screenHeight: 80,
  screenPageTop: 100,
  viewportY: 12
};
```

Keep the existing `raw terminal mode` tests and add:

```ts
describe("Raw terminal touch focus", () => {
  it("accepts only a tap in the visible cursor row", () => {
    expect(shouldFocusRawTerminalTap(cursorTap)).toBe(true);
    expect(shouldFocusRawTerminalTap({ ...cursorTap, pageY: 150 })).toBe(false);
    expect(shouldFocusRawTerminalTap({ ...cursorTap, cursorY: 1 })).toBe(false);
  });

  it("rejects cursor-row coordinates while the cursor page is below scrollback", () => {
    expect(shouldFocusRawTerminalTap({ ...cursorTap, viewportY: 8 })).toBe(false);
  });

  it("uses half-open row and screen boundaries", () => {
    expect(shouldFocusRawTerminalTap({ ...cursorTap, pageY: 160 })).toBe(true);
    expect(shouldFocusRawTerminalTap({ ...cursorTap, pageY: 159.999 })).toBe(false);
    expect(shouldFocusRawTerminalTap({ ...cursorTap, pageY: 180 })).toBe(false);
  });

  it.each([
    { pageY: undefined },
    { pageY: Number.NaN },
    { rows: 0 },
    { rows: 2.5 },
    { screenHeight: 0 },
    { screenHeight: Number.POSITIVE_INFINITY },
    { screenPageTop: Number.NaN },
    { cursorY: -1 },
    { cursorY: 4 }
  ])("fails closed for invalid tap state %#", (patch) => {
    expect(shouldFocusRawTerminalTap({ ...cursorTap, ...patch })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the targeted tests and confirm RED**

Run:

```bash
pnpm vitest run src/client/__tests__/rawTerminalMode.test.ts
```

Expected: FAIL because `shouldFocusRawTerminalTap` is not exported.

- [ ] **Step 3: Implement the minimal pure policy**

Add this type and function to `src/client/rawTerminalMode.ts` without changing the existing visibility helpers:

```ts
export type RawTerminalTapContext = {
  baseY: number;
  cursorY: number;
  pageY?: number;
  rows: number;
  screenHeight: number;
  screenPageTop: number;
  viewportY: number;
};

export function shouldFocusRawTerminalTap({
  baseY,
  cursorY,
  pageY,
  rows,
  screenHeight,
  screenPageTop,
  viewportY
}: RawTerminalTapContext): boolean {
  if (![baseY, cursorY, pageY, rows, screenHeight, screenPageTop, viewportY].every(Number.isFinite)) {
    return false;
  }
  if (!Number.isInteger(rows) || rows <= 0 || screenHeight <= 0) {
    return false;
  }
  if (!Number.isInteger(cursorY) || cursorY < 0 || cursorY >= rows || viewportY !== baseY) {
    return false;
  }

  const screenBottom = screenPageTop + screenHeight;
  if (!Number.isFinite(screenBottom) || pageY! < screenPageTop || pageY! >= screenBottom) {
    return false;
  }

  const row = Math.floor((pageY! - screenPageTop) / (screenHeight / rows));
  return row === cursorY;
}
```

- [ ] **Step 4: Run focused and full unit tests**

Run:

```bash
pnpm vitest run src/client/__tests__/rawTerminalMode.test.ts
pnpm test
```

Expected: the focused file and complete Vitest suite pass with no changed existing expectations.

- [ ] **Step 5: Commit the policy**

```bash
git add src/client/rawTerminalMode.ts src/client/__tests__/rawTerminalMode.test.ts
git commit -m "Add Raw terminal cursor tap policy"
```

---

### Task 2: Tap-Only Focus Wiring And Rendered Regression

**Files:**
- Modify: `src/client/App.tsx:60,670-848,1312-1329,2198-2205`
- Create: `scripts/verify-raw-terminal-focus.mjs`
- Modify: `package.json:7-20`

**Interfaces:**
- Consumes: `shouldFocusRawTerminalTap(context)` from Task 1, xterm's exact pinned `-xterm-gesturetap` event, `.xterm-screen`, existing `mobileRawInput`, and terminal buffer state.
- Produces: listener cleanup bound to each Raw terminal instance and `pnpm test:raw-focus`, a durable rendered behavior check.

- [ ] **Step 1: Add the rendered regression script**

Create `scripts/verify-raw-terminal-focus.mjs`:

```js
import { chromium } from "playwright";
import { createServer } from "vite";

const vite = await createServer({
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 }
});
let browser;

try {
  await vite.listen();
  const origin = vite.resolvedUrls?.local?.[0];
  if (!origin) {
    throw new Error("Vite did not expose a loopback URL");
  }

  browser = await chromium.launch({ headless: true });
  await verifyMobileFocus(browser, new URL("?demo=1", origin).href);
  await verifyDesktopFocus(browser, new URL("?demo=1", origin).href);
  console.log("Raw terminal focus verification passed");
} finally {
  await browser?.close();
  await vite.close();
}

async function verifyMobileFocus(browser, url) {
  const context = await browser.newContext({
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    screen: { width: 390, height: 844 },
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36",
    viewport: { width: 390, height: 844 }
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.stack || error.message}`));

  try {
    await loadRaw(page, url);
    await expectXtermFocus(page, false, "initial mobile Raw load");

    let points = await terminalPoints(page);
    await page.touchscreen.tap(points.output.x, points.output.y);
    await expectXtermFocus(page, false, "non-cursor output tap");

    await page.touchscreen.tap(points.cursor.x, points.cursor.y);
    await expectXtermFocus(page, true, "cursor-row tap");
    await blurActiveElement(page);

    const cdp = await context.newCDPSession(page);
    await touchStart(cdp, points.cursor);
    await page.waitForTimeout(760);
    await touchEnd(cdp);
    await expectXtermFocus(page, false, "cursor-row long press");

    const escapeButton = page.locator('.tmux-soft-keys button[title="Escape"]');
    const escapeBox = await requiredBox(escapeButton, "Escape soft key");
    await page.touchscreen.tap(escapeBox.x + escapeBox.width / 2, escapeBox.y + escapeBox.height / 2);
    await page.locator(".tmux-terminal-status").filter({ hasText: "sent Esc" }).waitFor();
    await expectXtermFocus(page, false, "Raw soft key");

    await dragTouch(cdp, points.cursor, points.screen);
    await expectXtermFocus(page, false, "drag starting on cursor row");

    await loadRaw(page, url);
    points = await terminalPoints(page);
    await dragTouch(cdp, points.output, points.screen);
    await expectXtermFocus(page, false, "drag starting on output");

    await page.getByLabel(/Change view\. Current view:/).click();
    await page.getByRole("menuitemradio", { name: "GUI" }).click();
    const visibleInput = page.locator('.tmux-send textarea[placeholder="send keys + Enter"]');
    await visibleInput.tap();
    await visibleInput.fill("visible-entry-check");
    if (await visibleInput.evaluate((node) => document.activeElement !== node)) {
      throw new Error("GUI visible input did not retain focus");
    }
    await page.getByLabel("Send to tmux").tap();
    if (await visibleInput.inputValue() !== "") {
      throw new Error("GUI visible input did not submit and clear");
    }

    if (errors.length > 0) {
      throw new Error(`Mobile browser errors:\n${errors.join("\n")}`);
    }
  } finally {
    await context.close();
  }
}

async function verifyDesktopFocus(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await loadRaw(page, url);
    await blurActiveElement(page);
    const screen = await requiredBox(page.locator(".xterm-screen"), "desktop xterm screen");
    await page.mouse.click(screen.x + screen.width / 2, screen.y + screen.height / 2);
    await expectXtermFocus(page, true, "desktop mouse click");
  } finally {
    await context.close();
  }
}

async function loadRaw(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator(".xterm-helper-textarea").waitFor({ state: "attached" });
  await page.locator(".xterm-screen").waitFor({ state: "visible" });
}

async function terminalPoints(page) {
  const screen = await requiredBox(page.locator(".xterm-screen"), "xterm screen");
  const cursor = await requiredBox(page.locator(".xterm-helper-textarea"), "xterm cursor textarea");
  const cursorY = cursor.y + cursor.height / 2;
  const topY = screen.y + cursor.height / 2;
  const bottomY = screen.y + screen.height - cursor.height / 2;
  const outputY = Math.abs(topY - cursorY) > cursor.height * 1.5 ? topY : bottomY;
  return {
    cursor: { x: screen.x + screen.width / 2, y: cursorY },
    output: { x: screen.x + screen.width - 8, y: outputY },
    screen
  };
}

async function requiredBox(locator, label) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${label} has no bounding box`);
  return box;
}

async function blurActiveElement(page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

async function expectXtermFocus(page, expected, label) {
  await page.waitForTimeout(100);
  const focused = await page.evaluate(() => (
    document.activeElement === document.querySelector(".xterm-helper-textarea")
  ));
  if (focused !== expected) {
    throw new Error(`${label}: expected xterm focus ${expected}, received ${focused}`);
  }
}

async function touchStart(cdp, point) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x: point.x, y: point.y, radiusX: 2, radiusY: 2, force: 1 }]
  });
}

async function touchEnd(cdp) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function dragTouch(cdp, start, screen) {
  const roomAbove = start.y - screen.y;
  const direction = roomAbove > 120 ? -1 : 1;
  await touchStart(cdp, start);
  for (const distance of [20, 40, 70, 100]) {
    await pageDelay(25);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        id: 1,
        x: start.x,
        y: start.y + direction * distance,
        radiusX: 2,
        radiusY: 2,
        force: 1
      }]
    });
  }
  await touchEnd(cdp);
  await pageDelay(150);
}

function pageDelay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
```

Add this script to `package.json` after `test`:

```json
"test:raw-focus": "node scripts/verify-raw-terminal-focus.mjs",
```

- [ ] **Step 2: Run the rendered check and confirm RED**

Run:

```bash
pnpm test:raw-focus
```

Expected: FAIL at `initial mobile Raw load` because the current demo initialization focuses xterm on mobile. If the first failure names a later touch interaction instead, retain it as equivalent evidence that current focus behavior violates the approved contract.

- [ ] **Step 3: Wire cursor-row tap focus in `App.tsx`**

Extend the `rawTerminalMode.js` import:

```ts
import {
  shouldFocusRawTerminalTap,
  shouldShowRawTerminalShortcuts,
  shouldShowTmuxJumpToLatest,
  shouldShowTmuxSendForm
} from "./rawTerminalMode.js";
```

Immediately after `terminal.open(node)` and gesture-guard installation, add:

```ts
const terminalScreen = terminal.element?.querySelector<HTMLElement>(".xterm-screen") ?? null;
const focusTerminalFromTap = (event: Event) => {
  if (!terminalScreen) {
    return;
  }
  const bounds = terminalScreen.getBoundingClientRect();
  const pageY = (event as Event & { pageY?: number }).pageY;
  if (shouldFocusRawTerminalTap({
    baseY: terminal.buffer.active.baseY,
    cursorY: terminal.buffer.active.cursorY,
    pageY,
    rows: terminal.rows,
    screenHeight: bounds.height,
    screenPageTop: bounds.top + window.scrollY,
    viewportY: terminal.buffer.active.viewportY
  })) {
    terminal.focus();
  }
};
terminalScreen?.addEventListener("-xterm-gesturetap", focusTerminalFromTap);
```

Delete the native Raw-host pointerdown listener:

```ts
const focusTerminal = () => {
  terminal.focus();
};
node.addEventListener("pointerdown", focusTerminal);
```

Gate both existing automatic focus calls, in demo initialization and `terminalSocket.onopen`, with:

```ts
if (!mobileRawInput) {
  terminal.focus();
}
```

In the Raw effect cleanup, replace the deleted pointerdown cleanup with:

```ts
terminalScreen?.removeEventListener("-xterm-gesturetap", focusTerminalFromTap);
```

Include `mobileRawInput` in the Raw effect dependency list:

```ts
}, [colorTheme, mobileRawInput, rawTerminalConnectionId, selectedTmux, terminalActive]);
```

Reduce `sendRawTerminalData` to direct status/socket behavior with no focus side effect, and delete the now-unused `focusRawTerminal` function:

```ts
function sendRawTerminalData(data: string) {
  if (demoMode && terminalActive) {
    setTerminalStatus(`sent ${describeTerminalKey(data)} to ${selectedTmux}`);
    return;
  }
  const socket = terminalSocketRef.current;
  if (!terminalActive || !socket || socket.readyState !== WebSocket.OPEN) {
    setTerminalStatus("raw terminal not connected");
    return;
  }
  socket.send(JSON.stringify({ type: "input", data }));
}
```

Remove the React pointerdown callback from the Raw host:

```tsx
<div
  ref={terminalHostRef}
  aria-label="Raw interactive tmux terminal"
  className="tmux-terminal"
  role="application"
/>
```

- [ ] **Step 4: Run focused checks and confirm GREEN**

Run:

```bash
pnpm vitest run src/client/__tests__/rawTerminalMode.test.ts src/client/__tests__/rawTerminalGestureGuard.test.ts
pnpm test:raw-focus
pnpm typecheck
```

Expected: unit tests pass, rendered verification prints `Raw terminal focus verification passed`, and both TypeScript projects pass.

- [ ] **Step 5: Inspect focus call sites and listener cleanup**

Run:

```bash
rg -n 'focusRawTerminal|addEventListener\("pointerdown"|onPointerDown=|terminal\.focus\(|-xterm-gesturetap' src/client/App.tsx src/client/rawTerminalMode.ts scripts/verify-raw-terminal-focus.mjs
git diff --check
```

Expected: no `focusRawTerminal`, Raw-host pointerdown focus, or Raw-host React pointerdown remains; `terminal.focus()` appears only in the cursor-tap handler and the two desktop-gated automatic paths; gesture-tap add/remove calls form one pair.

- [ ] **Step 6: Commit the behavior and rendered regression**

```bash
git add src/client/App.tsx scripts/verify-raw-terminal-focus.mjs package.json
git commit -m "Fix Raw terminal mobile focus"
```

---

### Task 3: Full Regression Gate And Independent Review

**Files:**
- Create temporarily: `/tmp/opencode/raw-mobile-focus-qa/`
- Reuse temporarily: `/tmp/opencode/raw-touch-settings-qa/task-5-5f6500d4/task-5-browser-qa.mjs`
- Do not modify: existing sessions, production service files, or tracked source during QA

**Interfaces:**
- Consumes: reviewed commits from Tasks 1-2, repository Playwright Chromium, a separate tmux socket, and the prior trusted-touch QA harness.
- Produces: evidence that keyboard focus changed without regressing scrolling, PTY parity, links, reconnect, rotation, selection behavior, or malformed-inertia blocking.

- [ ] **Step 1: Run the complete automated gate**

```bash
pnpm test
pnpm test:raw-focus
pnpm typecheck
pnpm build
ANDROID_HOME=/usr/lib/android-sdk ANDROID_SDK_ROOT=/usr/lib/android-sdk ./android/gradlew -p android testDebugUnitTest testReleaseUnitTest --rerun-tasks
git diff --check
git status --short --branch
```

Expected: all web and Android tests pass, the rendered focus check passes, production builds complete, and the tracked worktree is clean.

- [ ] **Step 2: Run isolated trusted-touch and PTY parity QA**

Create `/tmp/opencode/raw-mobile-focus-qa/` and a disposable tmux server by setting a unique `TMUX_TMPDIR`; explicitly unset `TMUX` and `TMUX_PANE`. Create exactly one session, enable tmux mouse mode and 10,000-line history, and print 600 numbered lines:

```bash
qa_root="/tmp/opencode/raw-mobile-focus-qa/$(git rev-parse --short HEAD)"
tmux_tmp="$qa_root/tmux-tmp"
session="agent-tmux-focus-qa-$(git rev-parse --short HEAD)"
mkdir -p "$tmux_tmp"
env -u TMUX -u TMUX_PANE TMUX_TMPDIR="$tmux_tmp" tmux new-session -d -s "$session" "bash --noprofile --norc"
env -u TMUX -u TMUX_PANE TMUX_TMPDIR="$tmux_tmp" tmux set-option -t "$session" mouse on
env -u TMUX -u TMUX_PANE TMUX_TMPDIR="$tmux_tmp" tmux set-option -t "$session" history-limit 10000
env -u TMUX -u TMUX_PANE TMUX_TMPDIR="$tmux_tmp" tmux send-keys -t "$session" 'for i in $(seq 1 600); do printf "touch-test %04d\n" "$i"; done' Enter
```

Adapt the existing temporary trusted-touch harness only under `$qa_root` to use the new session and add these active-element assertions around its existing CDP touch operations:

```js
const xtermFocused = () => document.activeElement === document.querySelector(".xterm-helper-textarea");

// After load, output tap, long press, each soft key, and each drag:
if (await page.evaluate(xtermFocused)) throw new Error("unexpected mobile xterm focus");

// After a stationary tap centered on the .xterm-helper-textarea row:
if (!await page.evaluate(xtermFocused)) throw new Error("cursor-row tap did not focus xterm");
```

Retain the prior harness checks for 12 trusted direct touch moves, visible history movement or tmux copy-mode entry, finite SGR coordinates, browser-input/server-input/PTY-write byte parity, no input containing `NaN`, `Infinity`, or `undefined`, desktop wheel, link opening, soft-key delivery, reconnect, rotation, console errors, and page errors.

Expected: cursor-row tap is the only mobile terminal interaction that focuses xterm; all prior Raw touch and PTY checks remain passing.

- [ ] **Step 3: Clean only disposable QA resources**

```bash
env -u TMUX -u TMUX_PANE TMUX_TMPDIR="$tmux_tmp" tmux kill-session -t "$session"
env -u TMUX -u TMUX_PANE TMUX_TMPDIR="$tmux_tmp" tmux has-session -t "$session"
git status --short --branch
git diff --check
```

Expected: `has-session` reports no server/session, no browser or temporary server process remains, and tracked source is clean.

- [ ] **Step 4: Obtain independent code review**

Review the complete branch diff from `5f6500d` through branch HEAD. Require explicit checks for cursor-row arithmetic, event-listener cleanup, mobile auto-focus suppression, desktop mouse behavior, xterm internal-event coupling, rendered-test reliability, private-data safety, and unintended changes to the gesture guard.

Expected: no open Critical or Important findings. Fix any finding with a failing regression test, rerun Tasks 1-3, commit the fix separately, and repeat review.

---

### Task 4: Fast-Forward Deployment And Private APK 0.1.24-private.2

**Files:**
- Modify locally: the primary checkout by fast-forward merge only
- Create ignored artifact: `android/app/build/outputs/apk/release/agent-tmux-web-v0.1.24-private.2-release.apk`
- Create ignored staged download: `dist/client/assets/agent-tmux-web-v0.1.24-private.2-release.apk`

**Interfaces:**
- Consumes: clean reviewed branch, ignored `android/local.properties`, active private service, Android SDK, existing private signing identity, and trusted Tailscale delivery.
- Produces: rebuilt private web client and installable APK `0.1.24-private.2` (`20027`) without a public push or release.

- [ ] **Step 1: Fast-forward local main without touching unrelated files**

In the primary checkout, inspect `git status --short --branch`, `git diff`, and `git log --oneline -10`. Confirm unrelated local files remain untouched, then run:

```bash
git merge --ff-only agent/fix-raw-touch-settings
pnpm install --frozen-lockfile
pnpm test
pnpm test:raw-focus
pnpm typecheck
pnpm build
```

Expected: main fast-forwards to the reviewed head and all gates pass. Do not push.

- [ ] **Step 2: Verify the live client rebuild without restarting service or tmux**

```bash
systemctl --user is-active codex-web.service
curl --fail --silent http://127.0.0.1:6174/healthz
```

Expected: service remains `active`, health returns `{"ok":true}`, existing tmux sessions remain present, and the service serves the newly rebuilt client bundle from `dist/client`. Do not run `systemctl restart`, `tmux kill-server`, or any command targeting existing sessions.

- [ ] **Step 3: Preflight private Android defaults without printing values**

Run this from main:

```bash
node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const values = new Map(readFileSync("android/local.properties", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith("#") && line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]));
  if (!values.get("agentTmuxDefaultUrl")) throw new Error("private default URL is missing");
  if (values.get("agentTmuxDefaultToken")) throw new Error("private default token must remain empty");
  console.log("Private Android defaults: URL present; token empty");
'
```

Expected: only the value-suppressing success message is printed.

- [ ] **Step 4: Build the incremented private APK**

```bash
AGENT_TMUX_ANDROID_VERSION_NAME=0.1.24-private.2 \
AGENT_TMUX_ANDROID_VERSION_CODE=20027 \
ANDROID_HOME=/usr/lib/android-sdk \
ANDROID_SDK_ROOT=/usr/lib/android-sdk \
pnpm android:build:private
```

Expected artifact:

```text
android/app/build/outputs/apk/release/agent-tmux-web-v0.1.24-private.2-release.apk
```

The private build runs Vite again and clears `dist/client/assets`; do not assume an older staged APK survived.

- [ ] **Step 5: Verify package identity, version, signing continuity, and checksum**

```bash
apk="android/app/build/outputs/apk/release/agent-tmux-web-v0.1.24-private.2-release.apk"
aapt dump badging "$apk"
apksigner verify --print-certs "$apk"
sha256sum "$apk"
```

Expected: package `com.agenttmux.web.private`, version code `20027`, version name `0.1.24-private.2`, and the signer certificate digest matches `0.1.24-private.1`. Verify generated release `BuildConfig` has the ignored non-empty default URL and empty default token without printing either value.

- [ ] **Step 6: Stage only after the final build and verify private download bytes**

```bash
pnpm android:stage-apk "$apk"
```

Fetch the generated URL through the trusted private service into `/tmp/opencode/agent-tmux-web-v0.1.24-private.2-release.apk`. Compare `stat` byte counts and `sha256sum` output with `$apk`.

Expected: HTTP success, identical byte size, and identical SHA-256. If any build runs afterward, repeat this staging and byte-verification step. Never put the URL or APK in git, GitHub, release notes, or public logs.

- [ ] **Step 7: Report and perform physical Android verification**

Provide the private download URL, version `0.1.24-private.2` (`20027`), size, and SHA-256 directly to the user. Ask for these checks on the physical Android device:

```text
install update -> open Raw -> tap cursor row -> keyboard opens -> type succeeds
dismiss keyboard -> tap older output -> keyboard stays closed
dismiss keyboard -> drag output, including a drag starting on the cursor row -> keyboard stays closed and history scrolls
long press output -> keyboard stays closed
press Raw soft keys -> keys reach tmux and keyboard stays closed
desktop browser mouse click -> xterm still accepts physical keyboard input
```

Do not claim a physical-device pass until the user confirms it. Keep the private APK staged until installation succeeds.
