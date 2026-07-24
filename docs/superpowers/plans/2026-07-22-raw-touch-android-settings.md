# Raw Touch Scrolling And Android Connection Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Raw terminal finger scrolling, move Android connection configuration into the existing View menu, deploy the corrected web client privately, and provide an updateable private APK with the existing Tailscale URL default.

**Architecture:** Fix scrolling at its confirmed source by exactly pinning the coherent xterm beta line containing upstream touch gestures, then block only its coordinate-less inertia events before mouse conversion without synthesizing replacement scrolling. Add one testable web bridge helper and one narrow Android UI-thread callback so the existing View menu can open the existing native setup panel without a floating native button. Merge the reviewed branch locally before rebuilding the private service and APK because the APK loads the server-hosted client.

**Tech Stack:** React 19, TypeScript, xterm 6.1 beta, Vitest, Playwright Chromium, Android Java/WebView, JUnit 4, Gradle, tmux, systemd user service

## Global Constraints

- Pin exactly `@xterm/xterm@6.1.0-beta.291`, `@xterm/addon-fit@0.12.0-beta.291`, and `@xterm/addon-web-links@0.13.0-beta.291` with no semver range.
- Do not add a custom touch-to-wheel or touch-to-scroll bridge.
- Stop only `-xterm-gesturechange` events with a non-finite `clientX`, `clientY`, `pageX`, or `pageY`; pass finite direct touch changes through unchanged.
- Do not synthesize replacement inertial momentum.
- Remove the native floating `Set` button completely.
- Render `Connection settings` only when `window.AgentTmuxAndroid.openConnectionSettings` exists.
- Put `Connection settings` in an Android-only `App` section of the existing View menu.
- Keep automatic native setup only for first run when no stored or injected URL exists.
- Connection health must not add, remove, or reposition workbench controls.
- Build private version name `0.1.24-private.1` with version code `20026` and package ID `com.agenttmux.web.private`.
- Inject the existing ignored non-empty Tailscale URL, keep the verified default token empty, and preserve the existing debug signing identity.
- Never print, commit, or publicly publish the private URL, token, APK, signing files, signing passwords, or private service address.
- Do not restart the private service or touch tmux sessions when a client-only rebuild is sufficient.
- The private APK download is staged only on the trusted Tailscale-reachable service.

---

### Task 1: Restore Upstream Xterm Touch Scrolling

**Files:**
- Create: `src/client/__tests__/rawTerminalDependencies.test.ts`
- Modify: `package.json:22-27`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: the existing Raw terminal setup in `src/client/App.tsx`, which uses xterm's own viewport and mouse semantics.
- Produces: an exact coherent xterm dependency set with the upstream touch gesture fix; no application API changes.

- [ ] **Step 1: Add the failing exact-version regression test**

Create `src/client/__tests__/rawTerminalDependencies.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm test src/client/__tests__/rawTerminalDependencies.test.ts
```

Expected: FAIL because the repository currently resolves xterm `6.0.0`, addon-fit `0.11.0`, and addon-web-links `0.12.0` through caret ranges.

- [ ] **Step 3: Install the exact coherent dependency set**

Run:

```bash
pnpm add -E @xterm/xterm@6.1.0-beta.291 @xterm/addon-fit@0.12.0-beta.291 @xterm/addon-web-links@0.13.0-beta.291
```

Do not change `src/client/App.tsx` terminal event handling and do not add CSS touch overrides.

- [ ] **Step 4: Verify the dependency change**

Run:

```bash
pnpm test src/client/__tests__/rawTerminalDependencies.test.ts
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Expected: the focused test and full suite pass, TypeScript and production builds exit 0, and no whitespace errors appear.

- [ ] **Step 5: Commit Task 1**

```bash
git add package.json pnpm-lock.yaml src/client/__tests__/rawTerminalDependencies.test.ts
git commit -m "Restore Raw terminal touch scrolling"
```

---

### Task 2: Add The Android-Only View Menu Action

**Files:**
- Create: `src/client/androidConnectionSettings.ts`
- Create: `src/client/__tests__/androidConnectionSettings.test.ts`
- Modify: `src/client/androidBridge.ts:1-8`
- Modify: `src/client/App.tsx:44-85, 1219-1250, 1971-2005`
- Modify: `src/client/__tests__/styles.test.ts:42-71`

**Interfaces:**
- Consumes: optional `window.AgentTmuxAndroid` and the existing `tmuxViewMenuRef`/`closeTmuxViewMenu()` behavior.
- Produces: `hasAndroidConnectionSettings(bridge?): boolean`, `openAndroidConnectionSettings(bridge?): boolean`, and the optional bridge method `openConnectionSettings(): void` consumed by Task 3.

- [ ] **Step 1: Add failing bridge behavior tests**

Create `src/client/__tests__/androidConnectionSettings.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  hasAndroidConnectionSettings,
  openAndroidConnectionSettings
} from "../androidConnectionSettings.js";

describe("Android connection settings", () => {
  it("is available only when the Android bridge exposes settings", () => {
    expect(hasAndroidConnectionSettings(undefined)).toBe(false);
    expect(hasAndroidConnectionSettings({})).toBe(false);
    expect(hasAndroidConnectionSettings({ openConnectionSettings: () => {} })).toBe(true);
  });

  it("opens native settings and reports bridge failures", () => {
    const openConnectionSettings = vi.fn();

    expect(openAndroidConnectionSettings({ openConnectionSettings })).toBe(true);
    expect(openConnectionSettings).toHaveBeenCalledOnce();
    expect(openAndroidConnectionSettings(undefined)).toBe(false);
    expect(openAndroidConnectionSettings({
      openConnectionSettings: () => { throw new Error("bridge failed"); }
    })).toBe(false);
  });
});
```

Extend the existing mobile toolbar test in `src/client/__tests__/styles.test.ts` with:

```ts
expect(app).toContain("hasAndroidConnectionSettings");
expect(app).toContain("openAndroidConnectionSettings");
expect(app).toContain(">App</span>");
expect(app).toContain(">Connection settings</span>");
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm test src/client/__tests__/androidConnectionSettings.test.ts src/client/__tests__/styles.test.ts
```

Expected: FAIL because the helper, bridge method, and menu item do not exist.

- [ ] **Step 3: Add the narrow client bridge helper**

Add to `AndroidBridge` in `src/client/androidBridge.ts`:

```ts
openConnectionSettings?: () => void;
```

Create `src/client/androidConnectionSettings.ts`:

```ts
import type { AndroidBridge } from "./androidBridge.js";

function currentAndroidBridge(): AndroidBridge | undefined {
  return typeof window === "undefined" ? undefined : window.AgentTmuxAndroid;
}

export function hasAndroidConnectionSettings(
  bridge: AndroidBridge | undefined = currentAndroidBridge()
): boolean {
  return typeof bridge?.openConnectionSettings === "function";
}

export function openAndroidConnectionSettings(
  bridge: AndroidBridge | undefined = currentAndroidBridge()
): boolean {
  if (!hasAndroidConnectionSettings(bridge)) {
    return false;
  }
  try {
    bridge?.openConnectionSettings?.();
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Add the stable View menu action**

Import the two helpers in `src/client/App.tsx`:

```ts
import { hasAndroidConnectionSettings, openAndroidConnectionSettings } from "./androidConnectionSettings.js";
```

Inside `App`, derive availability from bridge capability, not connection health:

```ts
const androidConnectionSettingsAvailable = hasAndroidConnectionSettings();
```

Add beside `selectColorTheme`:

```ts
function showAndroidConnectionSettings() {
  closeTmuxViewMenu();
  if (!openAndroidConnectionSettings()) {
    setError("Unable to open Android connection settings");
  }
}
```

After the Theme section inside `.tmux-view-menu-content`, add:

```tsx
{androidConnectionSettingsAvailable && (
  <div className="tmux-view-menu-section">
    <span>App</span>
    <button role="menuitem" type="button" onClick={showAndroidConnectionSettings}>
      <Wrench size={15} />
      <span>Connection settings</span>
    </button>
  </div>
)}
```

Do not condition this section on status, WebSocket state, tmux selection, or URL query parameters.

- [ ] **Step 5: Verify and commit Task 2**

```bash
pnpm test src/client/__tests__/androidConnectionSettings.test.ts src/client/__tests__/styles.test.ts
pnpm test
pnpm typecheck
pnpm build
git diff --check
git add src/client/androidConnectionSettings.ts src/client/androidBridge.ts src/client/App.tsx src/client/__tests__/androidConnectionSettings.test.ts src/client/__tests__/styles.test.ts
git commit -m "Move Android connection settings into View menu"
```

Expected: focused and full tests pass; builds pass; browser source contains one capability-gated menu item and no connection-state condition.

---

### Task 3: Connect The Native Settings Panel And Remove Set

**Files:**
- Modify: `android/app/src/main/java/com/agenttmux/web/AgentNotificationBridge.java:14-25`
- Modify: `android/app/src/main/java/com/agenttmux/web/MainActivity.java:50-80, 283-356`
- Modify: `android/app/src/test/java/com/agenttmux/web/AgentNotificationBridgeTest.java`
- Modify: `src/client/__tests__/styles.test.ts`

**Interfaces:**
- Consumes: the web method name `openConnectionSettings()` from Task 2 and `MainActivity.showSetup()`.
- Produces: a `@JavascriptInterface openConnectionSettings()` method that schedules the existing setup panel on the Activity UI thread; no new setup UI.

- [ ] **Step 1: Add failing native bridge and source regressions**

Extend `AgentNotificationBridgeTest.java`:

```java
import static org.junit.Assert.assertTrue;

import java.util.concurrent.atomic.AtomicBoolean;
```

Add these tests:

```java
@Test
public void exposesConnectionSettingsToJavascript() throws Exception {
    Method method = AgentNotificationBridge.class.getMethod("openConnectionSettings");
    assertNotNull(method.getAnnotation(JavascriptInterface.class));
    assertEquals(void.class, method.getReturnType());
}

@Test
public void opensConnectionSettingsOnTheUiThread() {
    AtomicBoolean scheduled = new AtomicBoolean(false);
    AtomicBoolean opened = new AtomicBoolean(false);
    AgentNotificationBridge bridge = new AgentNotificationBridge(
        null,
        action -> {
            scheduled.set(true);
            action.run();
        },
        () -> opened.set(true)
    );

    bridge.openConnectionSettings();

    assertTrue(scheduled.get());
    assertTrue(opened.get());
}
```

Add a source assertion to `src/client/__tests__/styles.test.ts`:

```ts
it("removes the floating Android Set button in favor of the bridge menu", () => {
  const mainActivity = readFileSync(join(
    process.cwd(),
    "android/app/src/main/java/com/agenttmux/web/MainActivity.java"
  ), "utf8");

  expect(mainActivity).not.toContain("addSettingsButton");
  expect(mainActivity).not.toContain('setText("Set")');
  expect(mainActivity).toContain("new AgentNotificationBridge(this, this::showSetup)");
});
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm test src/client/__tests__/styles.test.ts
ANDROID_HOME=/usr/lib/android-sdk ANDROID_SDK_ROOT=/usr/lib/android-sdk ./android/gradlew -p android testDebugUnitTest --tests com.agenttmux.web.AgentNotificationBridgeTest --rerun-tasks
```

Expected: both commands fail because the native method/callback do not exist and the floating button remains.

- [ ] **Step 3: Add the UI-thread callback to the Android bridge**

In `AgentNotificationBridge.java`, add:

```java
@FunctionalInterface
interface UiThreadRunner {
    void run(Runnable action);
}

private final UiThreadRunner uiThreadRunner;
private final Runnable openConnectionSettings;

public AgentNotificationBridge(Activity activity, Runnable openConnectionSettings) {
    this(activity, activity::runOnUiThread, openConnectionSettings);
}

AgentNotificationBridge(
    Activity activity,
    UiThreadRunner uiThreadRunner,
    Runnable openConnectionSettings
) {
    this.activity = activity;
    this.uiThreadRunner = uiThreadRunner;
    this.openConnectionSettings = openConnectionSettings;
}

@JavascriptInterface
public void openConnectionSettings() {
    uiThreadRunner.run(openConnectionSettings);
}
```

Replace the existing one-argument constructor rather than retaining unused compatibility code.

- [ ] **Step 4: Remove the floating button and connect MainActivity**

In `MainActivity.configureWebView()`, replace the bridge registration with:

```java
webView.addJavascriptInterface(
    new AgentNotificationBridge(this, this::showSetup),
    "AgentTmuxAndroid"
);
```

Remove this call from `onCreate()`:

```java
addSettingsButton();
```

Delete the entire `addSettingsButton()` method. Keep `showSetup()`, first-run invocation, validation, persistence, server loading, and watch polling unchanged.

- [ ] **Step 5: Verify and commit Task 3**

```bash
pnpm test src/client/__tests__/styles.test.ts
ANDROID_HOME=/usr/lib/android-sdk ANDROID_SDK_ROOT=/usr/lib/android-sdk ./android/gradlew -p android testDebugUnitTest testReleaseUnitTest --rerun-tasks
pnpm test
pnpm typecheck
pnpm build
git diff --check
git add android/app/src/main/java/com/agenttmux/web/AgentNotificationBridge.java android/app/src/main/java/com/agenttmux/web/MainActivity.java android/app/src/test/java/com/agenttmux/web/AgentNotificationBridgeTest.java src/client/__tests__/styles.test.ts
git commit -m "Open Android connection settings from app menu"
```

Expected: 32 debug and 32 release Android tests pass (64 executions total); web tests/typecheck/build pass.

---

### Task 4: Block Malformed Xterm Inertia Reports

**Files:**
- Create: `src/client/rawTerminalGestureGuard.ts`
- Create: `src/client/__tests__/rawTerminalGestureGuard.test.ts`
- Modify: `src/client/App.tsx:667-843`
- Modify: `src/client/__tests__/styles.test.ts`
- Modify: `registry.json`

**Interfaces:**
- Consumes: xterm's internal `-xterm-gesturechange` event and the Raw terminal host lifecycle.
- Produces: `installRawTerminalGestureGuard(node): () => void`, which blocks only non-finite coordinate events and returns exact listener cleanup.

- [ ] **Step 1: Add failing guard behavior tests**

Create `src/client/__tests__/rawTerminalGestureGuard.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  installRawTerminalGestureGuard,
  shouldBlockRawTerminalGesture
} from "../rawTerminalGestureGuard.js";

describe("Raw terminal gesture guard", () => {
  it("blocks only gestures with non-finite coordinates", () => {
    expect(shouldBlockRawTerminalGesture({ clientX: 12, clientY: 24, pageX: 12, pageY: 24 })).toBe(false);
    expect(shouldBlockRawTerminalGesture({ clientX: undefined, clientY: 24, pageX: 12, pageY: 24 })).toBe(true);
    expect(shouldBlockRawTerminalGesture({ clientX: Number.NaN, clientY: 24, pageX: 12, pageY: 24 })).toBe(true);
  });

  it("registers in capture phase, blocks invalid inertia, and removes exactly", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const node = { addEventListener, removeEventListener };
    const cleanup = installRawTerminalGestureGuard(node);
    const listener = addEventListener.mock.calls[0]?.[1] as (event: Event) => void;
    const stopImmediatePropagation = vi.fn();

    listener({
      clientX: undefined,
      clientY: undefined,
      pageX: undefined,
      pageY: undefined,
      stopImmediatePropagation
    } as unknown as Event);
    expect(stopImmediatePropagation).toHaveBeenCalledOnce();

    cleanup();
    expect(addEventListener).toHaveBeenCalledWith("-xterm-gesturechange", listener, true);
    expect(removeEventListener).toHaveBeenCalledWith("-xterm-gesturechange", listener, true);
  });
});
```

Extend the Raw source assertion in `styles.test.ts`:

```ts
expect(app).toContain("installRawTerminalGestureGuard(node)");
expect(app).toContain("removeRawTerminalGestureGuard()");
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm test src/client/__tests__/rawTerminalGestureGuard.test.ts src/client/__tests__/styles.test.ts
```

Expected: FAIL because the guard module and Raw lifecycle wiring do not exist.

- [ ] **Step 3: Implement the selective capture guard**

Create `src/client/rawTerminalGestureGuard.ts`:

```ts
const XTERM_GESTURE_CHANGE_EVENT = "-xterm-gesturechange";

type RawTerminalGestureCoordinates = {
  clientX?: number;
  clientY?: number;
  pageX?: number;
  pageY?: number;
};

type RawTerminalGestureTarget = Pick<HTMLElement, "addEventListener" | "removeEventListener">;

export function shouldBlockRawTerminalGesture(event: RawTerminalGestureCoordinates): boolean {
  return ![event.clientX, event.clientY, event.pageX, event.pageY].every(Number.isFinite);
}

export function installRawTerminalGestureGuard(node: RawTerminalGestureTarget): () => void {
  const stopInvalidInertia = (event: Event) => {
    if (shouldBlockRawTerminalGesture(event as MouseEvent)) {
      event.stopImmediatePropagation();
    }
  };
  node.addEventListener(XTERM_GESTURE_CHANGE_EVENT, stopInvalidInertia, true);
  return () => node.removeEventListener(XTERM_GESTURE_CHANGE_EVENT, stopInvalidInertia, true);
}
```

Register the new runtime file and self-contained test in the same `web-app` and `full-project` registry sections used by other client helpers.

- [ ] **Step 4: Wire guard lifecycle into Raw terminal setup**

Import the helper in `App.tsx`. Immediately after `terminal.open(node)`, add:

```ts
const removeRawTerminalGestureGuard = installRawTerminalGestureGuard(node);
```

In the Raw effect cleanup, call:

```ts
removeRawTerminalGestureGuard();
```

Call cleanup before `terminal.dispose()`. Do not alter terminal input, wheel handling, CSS, selection, or socket data.

- [ ] **Step 5: Verify and commit Task 4**

```bash
pnpm test src/client/__tests__/rawTerminalGestureGuard.test.ts src/client/__tests__/styles.test.ts src/shared/__tests__/registry.test.ts
pnpm test
pnpm typecheck
pnpm build
git diff --check
git add src/client/rawTerminalGestureGuard.ts src/client/__tests__/rawTerminalGestureGuard.test.ts src/client/App.tsx src/client/__tests__/styles.test.ts registry.json
git commit -m "Block malformed xterm touch inertia"
```

Expected: focused/full tests and builds pass; no custom scroll synthesis or PTY filtering exists.

---

### Task 5: Rendered QA, Local Deployment, And Private APK

**Files:**
- Create temporarily: `/tmp/opencode/raw-touch-settings-qa/`
- Create ignored artifact: `android/app/build/outputs/apk/release/agent-tmux-web-v0.1.24-private.1-release.apk`
- Create ignored staged download: `dist/client/assets/agent-tmux-web-v0.1.24-private.1-release.apk`
- Modify locally after review: main checkout through a fast-forward merge

**Interfaces:**
- Consumes: reviewed Tasks 1-3, the main checkout's ignored `android/local.properties`, local tmux, Playwright Chromium, Gradle, and the private systemd service.
- Produces: a privately deployed touch-enabled client and a Tailscale-only APK download; no public release or GitHub push.

- [ ] **Step 1: Run the complete pre-deployment gate**

```bash
pnpm test
pnpm typecheck
pnpm build
ANDROID_HOME=/usr/lib/android-sdk ANDROID_SDK_ROOT=/usr/lib/android-sdk ./android/gradlew -p android testDebugUnitTest testReleaseUnitTest --rerun-tasks
git diff --check
git status --short
```

Expected: all web and Android tests pass, builds pass, and the tracked worktree is clean.

- [ ] **Step 2: Verify the rendered Android-only menu**

Try Playwright MCP first. If Chromium MCP still fails because `/opt/google/chrome/chrome` is unavailable, use repository Playwright with:

```text
CHROMIUM_BIN=$HOME/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome
```

Run the built app on loopback and create a 390x844 mobile context. Before navigation, inject:

```js
window.__connectionSettingsOpened = 0;
window.AgentTmuxAndroid = {
  openConnectionSettings() {
    window.__connectionSettingsOpened += 1;
  }
};
```

Verify:

```text
app loads -> View menu opens -> App / Connection settings is visible -> click -> menu closes -> window.__connectionSettingsOpened === 1
```

Create a second browser context without the bridge and verify `Connection settings` is absent. Capture console output and screenshots under `/tmp/opencode/raw-touch-settings-qa/`, not in the repository.

- [ ] **Step 3: Verify actual touch scrolling with a disposable tmux session**

Create a uniquely named tmux session without touching existing sessions:

```bash
session="agent-tmux-touch-qa-$$"
tmux new-session -d -s "$session" "bash --noprofile --norc"
tmux set-option -t "$session" mouse on
tmux set-option -t "$session" history-limit 10000
tmux send-keys -t "$session" 'for i in $(seq 1 600); do printf "touch-test %04d\n" "$i"; done' Enter
```

Open the app in a touch-enabled 390x844 Chromium context with `?tmuxSession=<session>`. Record the visible terminal tail, dispatch a real touch start/move/end drag over `.xterm-screen`, and verify at least one of these concrete state changes:

```text
tmux display-message -p -t <session> '#{pane_in_mode}' changes from 0 to 1
visible .xterm-rows text changes from the original tail to older touch-test lines
the xterm viewport reports a lower viewportY than buffer baseY
```

Then verify desktop wheel scrolling, link activation, soft keys, reconnect, and a viewport rotation. Record long-press selection as pending when tmux mouse mode disables selection; do not treat that limitation as a scrolling failure or physical-device pass. Always remove only the disposable session:

```bash
tmux kill-session -t "$session"
```

Instrument the disposable loopback server immediately before its PTY write only for this QA run. Verify every browser `type: "input"` message exactly matches its PTY write and every SGR mouse report contains finite numeric coordinates. Fail the gate if any input contains `NaN`, `Infinity`, `undefined`, or malformed `ESC [ < ... M/m` coordinates.

- [ ] **Step 4: Obtain final branch review before deployment**

Generate a review package from merge base `main` to branch HEAD. Require no open Critical or Important finding before continuing. Fix findings on the branch with covering tests and re-review.

- [ ] **Step 5: Fast-forward local main and rebuild the private client**

From the main checkout, first verify it is still at the branch merge base and that only unrelated untracked files are present. Then run:

```bash
git merge --ff-only agent/fix-raw-touch-settings
pnpm install --frozen-lockfile
pnpm build
```

Verify the user service remains active and `/healthz` succeeds without printing its bind address. Compare the service's loaded client bundle bytes with the rebuilt bundle. Do not restart the service.

- [ ] **Step 6: Build and verify the private APK without printing config values**

In the updated main checkout, run a value-suppressing preflight that confirms `agentTmuxDefaultUrl` is non-empty and `agentTmuxDefaultToken` is absent/empty. Then build:

```bash
AGENT_TMUX_ANDROID_VERSION_NAME=0.1.24-private.1 \
AGENT_TMUX_ANDROID_VERSION_CODE=20026 \
ANDROID_HOME=/usr/lib/android-sdk \
ANDROID_SDK_ROOT=/usr/lib/android-sdk \
pnpm android:build:private
```

Set:

```text
apk=android/app/build/outputs/apk/release/agent-tmux-web-v0.1.24-private.1-release.apk
```

Verify without printing private values:

```text
aapt dump badging: package=com.agenttmux.web.private, versionCode=20026, versionName=0.1.24-private.1
generated release BuildConfig: DEFAULT_SERVER_URL exactly equals ignored local URL and is non-empty
generated release BuildConfig: DEFAULT_AUTH_TOKEN is empty
apksigner verify --print-certs: certificate digest matches the existing local v0.1.24 release APK/debug signing identity
```

Calculate and retain the APK SHA-256 for download verification.

- [ ] **Step 7: Stage and verify the Tailscale-only download**

```bash
pnpm android:stage-apk android/app/build/outputs/apk/release/agent-tmux-web-v0.1.24-private.1-release.apk
```

Use the generated private download URL only for direct user delivery. Fetch it through the private service, confirm HTTP success, byte size, and SHA-256 match the local APK. Do not publish the URL or APK in git, GitHub, release notes, logs, or documentation.

- [ ] **Step 8: Report installation and physical-device verification**

Provide the private download link, version `0.1.24-private.1` (`20026`), APK SHA-256, and these physical-device checks:

```text
install update -> open injected server -> select Raw -> drag upward through long output -> older lines appear
View menu -> App -> Connection settings -> native setup panel opens
return to workbench -> no floating Set button -> controls remain stable while reconnecting/disconnected
```

Record physical Android WebView verification as pending until the user installs the APK; do not claim emulator/browser evidence is a physical-device pass.

Remove `/tmp/opencode/raw-touch-settings-qa/` after its evidence has been reviewed. Keep the staged APK available until the user confirms installation.
