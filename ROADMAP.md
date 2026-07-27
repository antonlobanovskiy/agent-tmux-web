# Agent Tmux Web Roadmap

This roadmap captures the workflow review completed in July 2026. It is a
planning document rather than a release commitment. Priorities should be
revisited as usage changes.

## Product Direction

Agent Tmux Web is evolving from a browser-based tmux viewer into an agent
workspace manager. Its primary job is to make persistent terminal agents easy
to launch, monitor, resume, and control across desktop and mobile without
disrupting the underlying tmux sessions.

The core workspace model should eventually connect:

- a project directory;
- a tmux session;
- a preferred agent and permission mode;
- a preferred TTY or Raw view;
- current status, unread activity, and last interaction.

## Current Workflow

1. The server starts as a systemd user service.
2. A desktop browser or Android WebView connects over a private network.
3. The user selects or creates a project-oriented tmux session.
4. The user selects an agent launcher and permission mode, then runs it.
5. TTY is used for routine reading, links, copying, and prompt submission.
6. Raw is used when exact terminal input or a full-screen TUI is required.
7. Server-side watchers notify the client when a recently active session needs
   input or becomes idle.
8. tmux keeps sessions alive through browser disconnects and phone sleep.

Observed local usage strongly favors multiple persistent OpenCode sessions,
which makes the tmux workspace flow more important than the optional Codex
app-server conversation flow.

## What Works Well

- Persistent sessions make desktop-to-phone handoff practical.
- TTY and Raw cover both readable output and full terminal control.
- Project-oriented session names provide lightweight organization.
- Uploads provide restricted, temporary server-local attachment references.
- Session status, notification confirmation, mobile input, and scroll behavior
  have meaningful unit-test coverage.
- Private networking and upload handling have generally safe defaults.

## Known Friction And Risks

### Tailscale-dependent startup

The service has entered restart loops after boot because it tried to bind a
configured Tailscale address before that address existed. Depending only on
`network-online.target` does not guarantee that a VPN interface or address is
ready.

### Shared Raw terminal sizing

Raw attachment currently resizes the shared tmux window even when another tmux
client is attached. Opening a desktop session from a phone can therefore alter
the terminal dimensions seen by SSH, desktop tmux, or another browser. Multiple
Raw viewers can also race while saving and restoring window dimensions.

### Manual Raw recovery

When the Raw WebSocket closes unexpectedly, the user must refresh or switch
views. This is common enough on mobile network changes and sleep/wake cycles to
deserve automatic recovery.

### Multi-step session launch

The common action, "open the preferred agent for this project," currently
requires separate create, select, launcher, mode, and run actions.

### Heuristic agent status

Idle, running, error, and input-needed states are inferred from pane commands,
captured output, prompt patterns, and known CLI names. Agent UI changes, custom
shells, wrappers, localization, and full-screen TUIs can cause missed or false
state transitions.

### Partial watcher coverage

Watches normally start after launching a tool or sending input through the web
app. Work started outside the web app may not receive equivalent notification
coverage.

### Competing interaction models

The UI contains both a Codex app-server conversation flow and a tmux-agent flow.
Without a stronger boundary, users can be unclear about which session receives
a prompt and which state is authoritative.

### Limited operational visibility

The app does not provide a consolidated view of private-network reachability,
WebSocket health, watcher state, last notification event, upload cleanup,
service uptime, or launcher availability.

### Multiple installation sources of truth

The checked-in systemd templates, installer-generated service, and local
development setup can differ in working directory and environment handling.

### End-to-end coverage gaps

Component tests are stronger than tests of real tmux concurrency, authenticated
WebSockets, reconnect behavior, systemd startup, and Android lifecycle events.

## Phase 1: Reliability And Safety

### 1. Make private-network startup resilient

Preferred direction: bind the Node server to localhost and expose it through
Tailscale Serve or an equivalent authenticated private proxy.

Expected benefits:

- Node startup no longer depends on the VPN address being present.
- HTTPS enables browser secure-context features and notifications.
- The application does not listen directly on a network interface.
- Address changes and interface readiness are handled outside the application.

If direct binding remains supported, add an explicit readiness check with
bounded retry behavior and a clear startup error.

### 2. Protect shared tmux dimensions

- Resize normally only when no other terminal viewer is attached.
- Use `ignore-size` and preserve the existing window size when another viewer
  is present.
- Display a concise explanation when Raw uses an existing terminal size.
- Track concurrent web Raw viewers in addition to native tmux clients.
- Define deterministic ownership and restoration behavior for size changes.

### 3. Automatically reconnect Raw sessions

- Retry unexpected WebSocket closures with bounded exponential backoff.
- Show explicit Connected, Reconnecting, and Offline states.
- Preserve terminal output during short disconnects.
- Refit only after reconnection succeeds.
- Do not reconnect after an intentional detach or session change.

### 4. Unify service installation

- Generate checked-in and installed units from one source of truth.
- Keep working directory, environment-file loading, PATH, and restart behavior
  consistent.
- Verify upgrades without interrupting active tmux sessions.
- Add a startup smoke test for the generated unit.

### 5. Add a diagnostics surface

Report, without exposing secrets:

- server and service uptime;
- bind and private-network reachability;
- general and Raw WebSocket state;
- notification permission, watcher, and event-cursor state;
- available launcher commands;
- upload cleanup status and storage use.

## Phase 2: Faster Daily Workflow

### 1. Add project launch profiles

A profile should define a project directory, session name, preferred launcher,
permission mode, and preferred view. Opening it should resume the existing
session or create and launch it in one action.

Example conceptual profile:

```text
Project: Example App
Directory: ~/dev/example-app
Session: example-app
Agent: OpenCode
Mode: Auto
View: TTY
```

### 2. Add an attention inbox

Create a compact queue for sessions that need input or recently completed work.
Each item should include the session, state, age, and a direct link to the
relevant output.

### 3. Watch all recognized agent sessions

- Discover panes running supported agents even when launched outside the app.
- Poll active sessions more frequently and back off for idle sessions.
- Preserve notification deduplication and enable-time baselines.
- Expose why a session is or is not being watched.

### 4. Preserve per-session working state

- Save unsent prompt drafts per session.
- Track unread output and last-viewed position.
- Show last activity and current task duration.
- Restore the preferred view and input state on device return.

### 5. Add lifecycle actions

- Restart an agent without destroying its tmux session.
- Duplicate a workspace for parallel investigation.
- Review stale sessions rather than deleting them automatically.
- Group or filter sessions by project, operations, and general work.

## Phase 3: Product Simplification

### 1. Make tmux workspaces the primary model

Use one unambiguous prompt destination: the selected workspace. Consider moving
the optional Codex app-server experience behind a feature flag or separate
route so its threads cannot be confused with tmux sessions.

### 2. Improve authentication onboarding

- Replace long-lived query-string tokens with a one-time setup exchange and a
  secure cookie where practical.
- Avoid placing reusable credentials in history, copied URLs, screenshots, or
  logs.
- Add rate limiting around authentication and command endpoints.
- Keep local-only and private-proxy deployments straightforward.

### 3. Improve notification transparency

- Explain whether browser security context, OS permission, watcher coverage, or
  network state is blocking notifications.
- Open the exact session and output context from notification taps.
- Make delivery state observable without replaying old events.

### 4. Improve upload lifecycle handling

- Add aggregate storage quotas and disk-health reporting.
- Warn when an attachment may expire while a task is still active.
- Exercise upload, alias, cleanup, and expiration paths through a live server
  integration test.

## Verification Roadmap

Prioritize these end-to-end scenarios:

1. Create a real tmux session, launch an agent, send input, capture output, and
   detach without losing the session.
2. Connect two Raw viewers with different terminal dimensions.
3. Terminate and restore the Raw WebSocket while preserving the UI state.
4. Start the service while the configured private-network address is absent.
5. Exercise authenticated HTTP, upload, event WebSocket, and Raw WebSocket
   paths.
6. Exercise Android keyboard input, swipe typing, delete, rotation, sleep, wake,
   and reconnection in an emulator or device harness.
7. Validate notification classifications against representative fixtures from
   each supported agent CLI.
8. Install and start the generated systemd service in a clean environment.

## Smaller Candidate Improvements

- Add launcher defaults by directory or repository.
- Show the active pane command more clearly.
- Add an Android connection-test action.
- Show other viewer types and counts consistently.
- Warn before running high-risk launcher modes.
- Add a compact recent-project switcher.
- Expose stable links to a session without embedding credentials.
- Add optional local metrics for reconnects, false notifications, watcher lag,
  and upload cleanup failures.

## Recommended Starting Order

1. Make Tailscale/private-network startup resilient.
2. Protect shared tmux dimensions in Raw mode.
3. Add automatic Raw reconnection.
4. Introduce project launch profiles and one-click resume/create-and-launch.
5. Add the attention inbox and broader watcher coverage.

The first three items reduce proven reliability and terminal-integrity risks.
Project profiles then remove the most repetitive part of the daily workflow.

## Open Design Questions

- Should Tailscale Serve become the recommended default or remain an optional
  deployment pattern?
- When another viewer is attached, should Raw preserve the existing size or
  offer an explicit takeover action?
- Should workspace profiles be server-side and shared, device-local, or a mix?
- Is the Codex app-server flow still part of the core product direction?
- Which agent CLIs can provide structured status instead of terminal heuristics?
- How much local operational telemetry is useful without adding a database or
  collecting sensitive terminal content?

## Definition Of Success

- The service survives boot and private-network timing differences without a
  restart loop.
- Opening Raw on a phone does not unexpectedly disrupt another viewer.
- Short mobile disconnects recover without manual refresh.
- A common project agent can be resumed or launched in one action.
- Every recognized active agent has understandable watcher and notification
  state.
- The selected session is always the clear destination for user input.
- Critical desktop, mobile, networking, and tmux concurrency flows have
  repeatable end-to-end verification.
