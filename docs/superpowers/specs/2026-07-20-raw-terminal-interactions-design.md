# Raw Terminal Interactions Design

## Goal

Make Raw the default terminal experience for every tmux-backed harness, remove TTY from the user interface, open terminal links on the viewing device, copy terminal selections to the viewing device's clipboard, and prevent internal upload storage paths from reaching any web or mobile client.

## Approved Product Decisions

- Raw is the default view for the initial session, every newly selected session, and a session after a CLI is launched.
- TTY is removed from the view menu and client rendering path.
- GUI and Focus remain optional views.
- Raw shortcut buttons are hidden in desktop browsers and shown only for mobile browser input or the Android app.
- Default, Auto, Plan, Yolo, and related safety choices are labeled `Permission Mode`, not `Output Mode`.
- Only internal upload paths are forbidden. A safe user-relative attachment reference may appear in the shared tmux prompt so arbitrary CLI agents can read the file.
- The behavior must work for OpenCode, Codex, Claude, built-in launchers, and custom harnesses without per-harness adapters.

## Raw View Lifecycle

`App` initializes Raw mode before the first session is selected. Loading or selecting a session connects xterm to that session automatically. Launching a CLI returns the session to Raw after the command starts.

The view menu contains `Raw`, `GUI`, and `Focus`. Selecting GUI or Focus closes the Raw socket and uses the existing capture-based views. Selecting another session always applies the Raw default rather than carrying a normalized view across sessions.

The toolbar action currently named `Force Sync` becomes `Reconnect` while Raw is active. Reconnect tears down the current terminal socket and establishes a fresh connection to the same session without changing the tmux process. In GUI or Focus, the action remains `Force Sync` and refreshes captured output.

The Raw shortcut row (`Esc`, `Tab`, control keys, arrows, and `Enter`) is rendered only when the existing input-device detection identifies a mobile browser or when the Android bridge is present. Desktop browsers do not render the row, regardless of window width, because the physical keyboard already supplies those keys.

The unused TTY client component, tests, OpenCode Terminal/Details tabs, and TTY-only CSS are removed. Server capture and OpenCode sidebar parsing remain available because GUI, Focus, status classification, and background task watching still consume captured output.

## Link Opening

The official xterm web-links addon detects `http://`, `https://`, and `www.` links in Raw output. It is loaded into every xterm instance, so link behavior is harness-independent. Other schemes, including `javascript:`, `data:`, and `file:`, are never activated.

A shared client helper normalizes and opens approved links:

- In the Android wrapper, it calls a new `AgentTmuxAndroid.openExternalLink(url)` bridge method.
- In desktop and mobile browsers, it opens a new tab with `noopener` and `noreferrer` behavior.
- If a browser client cannot open the link, the terminal status reports the failure and the Agent Tmux page remains active.

The Android bridge validates the scheme again before starting an `ACTION_VIEW` browser intent. This direct bridge is required because xterm renders links on a canvas, so WebView hit testing cannot reliably recover the clicked URL.

## Selection Clipboard

Every xterm instance subscribes to `onSelectionChange`. A small selection-copy controller reads `terminal.getSelection()` and applies these rules:

- Ignore empty selections.
- Copy each changed non-empty selection immediately.
- Do not rewrite the clipboard when xterm emits the same selection repeatedly.
- Reset deduplication when the selection becomes empty so selecting the same text later copies again.
- Leave the terminal selection highlighted.

The controller uses the existing `writeClipboardText` abstraction. The Android app writes to the Android system clipboard through its native bridge. Browser clients use the browser clipboard and the existing compatibility fallback for private HTTP origins. The server clipboard is never used. A success or failure message is shown in terminal status without reconnecting or rerendering xterm.

This design makes the clipboard destination the device that performed the selection, even when the tmux process runs on another machine.

## Attachment Privacy

The upload storage path becomes server-internal data. `UploadedFileDto` exposes a `reference` field instead of an absolute `path` field, and `/api/uploads` never serializes the internal target path.

After saving an upload in the configured temporary storage root, the server creates a unique symlink below a user-relative alias root:

```text
~/.agent-tmux/attachments/YYYY-MM-DD/<timestamp-id-safe-name>
```

The API returns only the `~/.agent-tmux/attachments/...` reference. The client inserts:

```text
Attached file: ~/.agent-tmux/attachments/YYYY-MM-DD/<safe-name>
```

It never inserts `/tmp/...`, another absolute storage path, or the phrase `on server`. The alias works for arbitrary local CLI agents while keeping configurable storage details out of browsers, Android WebViews, shared tmux transcripts, logs produced by clients, and screenshots.

Alias names reuse the existing filename sanitization and unique timestamp/id format. The server creates the alias itself; clients cannot choose a symlink target. The hourly 24-hour cleanup removes expired storage targets and expired aliases. Legacy upload cleanup remains intact.

If alias creation fails, the upload request fails and removes the newly stored file. It must not fall back to returning the internal path.

## Component Boundaries

- `App.tsx`: Raw-default lifecycle, xterm addon wiring, reconnect behavior, mobile-only shortcut visibility, selection status, and removal of TTY rendering.
- `rawTerminalLinks.ts`: approved URL normalization and device-local opening policy.
- `rawTerminalSelection.ts`: selection deduplication and clipboard orchestration independent of React and xterm rendering.
- `clipboard.ts`: existing device-local clipboard implementation; no server fallback.
- `androidBridge.ts`: typed `openExternalLink` bridge contract.
- `AgentNotificationBridge.java`: validated Android external-browser intent and existing clipboard writer.
- `uploads.ts`: internal storage, safe alias creation, reference formatting, and cleanup.
- `api.ts`: attachment DTO with `reference`, never internal `path`.
- `TmuxTtyView.tsx`: removed with its dedicated tests and TTY-only styles.

## Error Handling

- Invalid or unsafe URLs are inert terminal text.
- Browser popup failure reports `Unable to open link` without navigating away from Agent Tmux.
- Android intent failure shows the existing native error toast and leaves the WebView active.
- Clipboard failure reports `Clipboard copy failed`; terminal input and selection remain intact.
- Upload or alias failure returns an error, removes partial output, and never exposes the internal path as a fallback.
- Raw reconnect failure uses the existing terminal connection status and does not terminate the tmux session.

## Testing And Verification

### Unit Tests

- URL normalization accepts HTTP, HTTPS, and `www.` and rejects unsafe schemes.
- Link opening prefers the Android bridge and otherwise opens a protected browser tab.
- Selection copying ignores empty/repeated selections, resets after clearing, and routes through the supplied clipboard writer.
- Android tests verify the JavaScript bridge method and approved-scheme external intent policy.
- Upload tests verify alias creation, safe references, path sanitization, rollback on alias failure, expiry cleanup, and that API-facing DTOs contain no absolute storage path.
- App/style tests verify Raw default, no TTY menu/rendering, GUI and Focus retention, Reconnect copy, mobile-only Raw shortcuts, `Permission Mode`, and the corrected 761-1120px grid behavior.

### Rendered Tests

- Desktop browser: initial Raw connection, no shortcut row, HTTP/HTTPS link click, selection auto-copy, Reconnect, GUI/Focus opt-in, session switch back to Raw, composer and notifications.
- Mobile browser: Raw default, visible shortcut row, tap link opens a browser tab, touch selection copies locally, Raw scrolling, soft-key input, and no clipped controls.
- Android wrapper: Raw default, canvas link opens the external browser, selection writes the Android clipboard, file chooser produces only a safe attachment reference, and no internal path appears.
- Responsive boundary checks: 760x600, 761x600, 800x600, 1120x700, 1121x700, and 1440x900 with usable terminal height, visible controls, and no horizontal overflow.

### Release Gates

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- Android unit tests
- `pnpm android:build:public`
- `pnpm android:verify-public-apk`
- Browser console and page-error checks
- Private-reference and secret scan of the final branch diff
- Independent final code review before PR creation and merge

No private design asset, private preview address, personal server address, auth token, upload content, generated screenshot, or local test URL is committed or published.
