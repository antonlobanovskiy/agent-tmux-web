# Raw Terminal Mobile Focus Design

## Goal

Keep Raw terminal typing available on touch devices without reopening the software keyboard during output browsing. After the keyboard is dismissed, a stationary tap on the visible terminal cursor row reopens it. Taps on other output, touch scrolling, long presses, and Raw soft keys leave it closed. Desktop mouse click-to-type remains unchanged.

## Confirmed Root Cause

The application currently focuses xterm's hidden editable `.xterm-helper-textarea` from two unconditional Raw-host `pointerdown` handlers. Both run before `touchstart`, so even a gesture that becomes a drag or long press activates an editable element and can invoke the Android software keyboard.

Raw soft keys also call the same focus helper before and after sending data. Demo initialization and terminal WebSocket connection focus xterm automatically on every device.

Repository Playwright isolation established that xterm's touch start, change, tap, context-menu, and end paths do not focus the textarea. Xterm's native `mousedown` handler does focus it for a real mouse click. Blocking only the application pointerdown handlers removes touch focus while preserving desktop click-to-type.

## Approved Interaction Rules

- A short, stationary touch tap on the active cursor row focuses xterm and opens the software keyboard.
- A tap on any other terminal row does not focus xterm.
- A touch drag never focuses xterm, including a drag that starts on the cursor row.
- A long press never focuses xterm.
- Raw soft keys send their existing terminal input without focusing xterm.
- Automatic focus during Raw initialization or socket connection is retained for desktop input and skipped on touch-first/mobile input.
- A desktop mouse click continues to focus xterm through xterm's native `mousedown` behavior.
- GUI and Focus keep their existing visible `send keys + Enter` textarea behavior.

## Selected Approach

Remove the application Raw-host pointerdown focus handlers and rely on xterm's `-xterm-gesturetap` event for intentional touch focus. This event is emitted only after touch release when xterm has classified the interaction as a tap rather than a drag or long press.

The tap handler maps the event's vertical page coordinate onto the xterm screen grid:

1. Read the `.xterm-screen` page bounds and terminal row count.
2. Reject missing or non-finite geometry and coordinates.
3. Reject coordinates outside the half-open screen interval from the top edge through, but not including, the bottom edge.
4. Divide the screen height by `terminal.rows` and resolve the zero-based tapped row.
5. Require `terminal.buffer.active.viewportY === terminal.buffer.active.baseY`, proving the live cursor page is visible rather than hidden below scrollback.
6. Focus the terminal only when the tapped row equals `terminal.buffer.active.cursorY`.

The project already pins the exact xterm beta build that defines this gesture event. A rendered regression test protects this dependency contract from future xterm upgrades.

## Rejected Alternatives

- Application pointer tracking: handling pointer down, move, cancel, and up could distinguish a tap, but it would duplicate xterm's gesture thresholds and cancellation semantics and add more state.
- Android WebView input-method interception: this would treat the symptom only in the native wrapper and leave mobile browsers inconsistent.
- Any-tap focus: this would prevent focus during a moving drag but still reopen the keyboard after ordinary taps used to inspect output.
- A new Raw text field or keyboard button: the existing cursor-row interaction is sufficient and the user does not want a new control.

## Components And Data Flow

- `src/client/App.tsx` removes native and React pointerdown focus wiring, installs and cleans up the xterm tap listener, gates automatic focus with the existing mobile-input policy, and sends soft keys without focus side effects.
- `src/client/rawTerminalMode.ts` adds a small pure helper for page-coordinate-to-cursor-row classification. It receives geometry and buffer values rather than xterm or DOM objects, keeping the rule independently testable.
- The existing `isMobileInputDevice(readInputDeviceContext())` result and Android bridge detection continue to define touch-first/mobile input for automatic-focus suppression.
- The terminal socket input, xterm `onData`, resize, reconnect, selection, link, and gesture-guard paths do not change.

## Failure Behavior

The cursor-row decision fails closed. A missing screen, zero or non-finite dimensions, a non-finite tap coordinate, an out-of-bounds coordinate, an invalid row count, or a cursor hidden by scrollback leaves the current focus unchanged.

The tap listener is removed in the existing Raw terminal effect cleanup. Reconnection, session changes, color-theme changes, and view switches cannot leave a listener attached to a disposed terminal.

If xterm stops emitting the pinned gesture event in a future dependency update, terminal touch focusing stops rather than reverting to keyboard activation during scrolling. The rendered regression test must fail before such an update is accepted.

## Verification

### Unit Tests

- Accept a finite tap in the active cursor row while the viewport is at the live bottom.
- Reject taps in rows above or below the cursor row.
- Reject an apparent cursor-row tap while the viewport is in scrollback.
- Reject missing, zero, non-finite, and out-of-bounds geometry or coordinates.
- Verify row-boundary behavior so a tap resolves to exactly one terminal row.

### Rendered Browser Tests

- Mobile/touch Raw initial load does not leave xterm's hidden textarea focused.
- A stationary tap on non-cursor output does not focus the hidden textarea.
- A stationary tap on the visible cursor row does focus the hidden textarea.
- A touch drag starting on the cursor row does not focus the hidden textarea and still scrolls Raw output.
- A touch drag starting elsewhere, a long press, and a Raw soft-key press do not focus the hidden textarea.
- Soft-key data still reaches the demo status or terminal socket.
- A desktop mouse click on Raw output focuses the hidden textarea through xterm's native path.
- GUI/Focus visible textarea entry and submission remain functional.
- Browser console and page-error checks remain clean.

### Release Gates

- Run the full web test suite, TypeScript checks, and production build.
- Repeat isolated rendered QA with finite touch input and enough terminal scrollback to prove scrolling remains functional.
- Confirm terminal input contains no malformed or `NaN` mouse reports.
- Rebuild the private service client without stopping tmux sessions.
- Rebuild and verify the private APK, then restage it after the final Vite build.
- On physical Android, dismiss the keyboard and verify scrolling, output taps, long press, and soft keys keep it closed while a cursor-row tap reopens it.

## Privacy And Distribution

The private service URL, token, local Android configuration, signing details, and APK remain outside git and public releases. The rebuilt private APK is staged only through the trusted Tailscale-reachable service.

## Out Of Scope

- Redesigning Raw mode or adding a visible Raw composer.
- Changing xterm touch scrolling, selection, link handling, tmux mouse reporting, or the malformed-inertia guard.
- Changing GUI or Focus input behavior.
- Publishing a new public release.
