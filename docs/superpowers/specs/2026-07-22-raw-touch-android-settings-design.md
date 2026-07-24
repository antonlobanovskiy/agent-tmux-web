# Raw Touch Scrolling And Android Connection Settings Design

## Goal

Restore finger scrolling in Raw terminal mode on Android and touch browsers, remove the floating native `Set` button, expose Android connection configuration through the existing View menu, deploy the web fix to the private service, and produce a private installable APK with the existing Tailscale URL default.

## Root Cause

Agent Tmux Web uses `@xterm/xterm` 6.0.0. That release has a confirmed upstream regression where the synthetic viewport rewrite omitted touch gesture scrolling. Desktop wheel events still work, but finger drags on Android, iOS, and emulated touch devices do not update terminal scrollback.

The surrounding mobile layout intentionally locks page scrolling and the Raw terminal uses xterm's synthetic viewport. Native CSS overflow cannot provide a correct fallback for both normal terminal scrollback and tmux mouse reporting. The Android `WebView` does not install a touch listener or otherwise consume terminal gestures.

The Android APK is a wrapper around the server-hosted web client. Therefore, rebuilding the APK without rebuilding the private server cannot fix Raw scrolling.

## Selected Approach

Pin the coherent xterm beta set that contains the merged upstream touch fix:

- `@xterm/xterm@6.1.0-beta.291`
- `@xterm/addon-fit@0.12.0-beta.291`
- `@xterm/addon-web-links@0.13.0-beta.291`

Exact versions prevent beta drift and keep all xterm packages on the same build line. The application will not add a custom touch-to-wheel bridge because that could interfere with long-press selection, link handling, alternate-screen behavior, and tmux mouse reporting.

Rendered QA found a second upstream beta defect: valid direct touch changes carry finite coordinates and scroll correctly, but post-touch inertia changes omit `clientX`, `clientY`, `pageX`, and `pageY`. xterm converts those coordinate-less changes to tmux mouse reports containing `NaN`, which can leak into the shell prompt.

Add one capture-phase guard for xterm's internal `-xterm-gesturechange` event. The guard calls `stopImmediatePropagation()` only when any of those four coordinates is non-finite. Finite direct touch changes continue to xterm unchanged. The application does not synthesize scrolling or replacement momentum; momentum is intentionally disabled until upstream inertia events carry valid coordinates or xterm rejects invalid coordinates itself.

Rejected alternatives:

- Downgrade to xterm 5.5.0: stable touch behavior, but reverses the 6.x viewport migration and increases unrelated regression risk.
- Add an application-level touch bridge: avoids beta packages, but duplicates terminal gesture semantics and is likely to conflict with selection and mouse protocols.

An isolated A/B test rejected the xterm 5.5.0 fallback because it ignores touch entirely while tmux mouse mode is active. The guarded beta moved through tmux history using only valid direct touch reports and emitted no malformed PTY input.

## Android Settings UI

The native floating `Set` button is removed completely. Connection state does not add, remove, or reposition workbench controls.

When `window.AgentTmuxAndroid` exposes `openConnectionSettings`, the existing View menu gains an Android-only `App` section with a `Connection settings` menu item. Selecting it closes the View menu and calls the native bridge. The bridge schedules `MainActivity.showSetup()` on the Android UI thread.

The first-run setup panel still opens automatically when neither stored preferences nor injected defaults provide a server URL. This is the only first-run exception to the stable workbench. After a URL is saved, the workbench remains visually identical whether the live connection is healthy, reconnecting, or disconnected.

The menu item is omitted in regular browsers. Browser users do not receive a dead Android-only control.

## Components And Data Flow

### Web Client

- `src/client/androidBridge.ts` adds the optional `openConnectionSettings(): void` bridge capability.
- `src/client/App.tsx` detects that capability and conditionally renders the menu item in the existing View menu.
- Selecting the item closes the native HTML `details` menu before invoking the bridge.
- `src/client/rawTerminalGestureGuard.ts` owns the finite-coordinate predicate and capture-listener lifecycle.
- Raw terminal setup installs that guard on the terminal host after xterm opens and removes it during effect cleanup.

### Android Wrapper

- `AgentNotificationBridge` receives a callback or narrow host interface for opening connection settings; it does not own setup layout details.
- `MainActivity` passes its existing `showSetup()` behavior through that interface.
- `MainActivity.onCreate()` no longer adds the floating `Set` button.
- Saving settings continues to persist the URL/token, close setup, load the configured server, and update watch polling.

### Private Service And APK

- The private service client bundle is rebuilt from the verified branch so it serves the corrected xterm code.
- The service is not restarted if a client-only rebuild is sufficient; tmux sessions are never stopped.
- The private APK uses the ignored local URL configuration. The verified configuration has no default token or release keystore, so the build keeps the token empty and preserves this machine's existing debug signing identity.
- The private build uses version name `0.1.24-private.1` and version code `20026` so Android accepts it as an update over the prior `20025` private build.
- The APK is staged only through the private Tailscale-reachable service and is never committed or uploaded to a public GitHub release.

## Error Handling

- If the Android bridge call throws or is unavailable, the web client reports a concise existing-style error instead of leaving the menu open.
- Invalid coordinate-less xterm inertia changes are stopped before mouse conversion; finite gesture changes are never modified or stopped.
- The setup form retains URL validation and does not replace a valid stored configuration with an empty value.
- A failed server load does not conditionally reintroduce the floating button. Connection configuration remains a menu action whenever the loaded workbench is available.
- Before staging this private build, a value-suppressing preflight requires a non-empty default URL, confirms the default token remains empty for the current private service, and records the signing certificate without printing configuration values.

## Verification

### Automated

- Add a dependency regression test that requires the exact matching xterm versions.
- Add unit coverage for finite/non-finite gesture classification, capture-listener registration, selective blocking, and cleanup.
- Add client tests for Android-only menu visibility, bridge invocation, menu closure, and browser omission.
- Add Android unit coverage for bridge-to-settings callback behavior.
- Run the full web suite, TypeScript checks, production build, and Android debug/release unit tests.
- Build the private APK and verify its package ID, version name/code, signing continuity, and injected non-empty defaults without printing their values.

### Rendered And Interaction

- Use Playwright Chromium with touch enabled to verify finger-drag scrollback in an xterm surface containing enough lines to scroll.
- Verify the real mobile workbench at 390x844: View menu opens, `Connection settings` appears only when the Android bridge exists, and invoking it calls the bridge without layout movement.
- Confirm no framework overlay or unexplained console errors.
- Verify desktop wheel scrolling still works.
- Verify touch scrolling with normal xterm scrollback and with tmux mouse mode enabled.
- Verify all Raw touch WebSocket inputs and PTY writes use finite numeric SGR mouse coordinates and contain no `NaN`.
- Verify links, soft keys, rotation, reconnect, and terminal resizing remain usable. Record long-press selection as unresolved when tmux mouse mode disables it; do not claim a physical-device pass from browser emulation.
- Perform a final physical-device check after APK installation because browser touch emulation cannot fully reproduce Android WebView gesture dispatch.

## Privacy And Distribution

- Do not commit or log the private Tailscale URL, auth token, keystore path, keystore password, key alias, or key password.
- Do not publish the private APK on GitHub or a public web endpoint.
- Treat the private APK as a credential-bearing secret because embedded defaults can be extracted.
- Provide the download only over the trusted Tailscale service and remove the staged binary when it is no longer needed.

## Out Of Scope

- Public `v0.1.25` release creation.
- Redesigning the setup panel.
- Bundling a complete offline copy of the web workbench into the APK.
- Changing tmux mouse configuration or terminal copy-mode semantics.
- Implementing replacement inertial momentum or claiming long-press selection works in tmux mouse mode without a physical-device pass.
