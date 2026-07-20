# Marketing Kit

## One-Liner

Agent Tmux Web lets you run coding-agent CLIs from your phone while tmux keeps
the real sessions alive on your server.

## Short Description

Run long agent sessions from your phone without keeping SSH open. Agent Tmux Web
solves the mobile terminal problem by separating the agent process from the
browser: tmux owns the session, while the web UI handles session switching, CLI
launchers, readable chat capture, status triage, stable scrollback, raw terminal
attach, and temporary file uploads over a private network path.

## Key Points

- Mobile-first tmux control for terminal agents.
- Launch OpenCode, Codex, Claude Code, Gemini CLI, GitHub Copilot, Cursor
  Agent, Qwen Code, Cline, Aider, goose, Amp, or custom commands.
- Browse launchers alphabetically, pin favorites to the top, and save named
  custom commands locally with the `+` control.
- Use grouped launcher modes for Default, Plan, Auto, Auto Edit, Autopilot, and
  Yolo presets without stacking incompatible permission modes.
- Start in Raw for direct tmux terminal control, then switch to normalized GUI
  or Focus views when you want captured output and status summaries.
- Use Focus mode and session status dots to see which tmux tab is running,
  waiting, or failing.
- Scroll back through active sessions without losing your place, then jump back
  to latest output when ready.
- Force Sync manually refreshes the captured pane without attaching to tmux.
- Upload files from Android or desktop browsers while local CLIs receive safe
  `~/.agent-tmux/attachments/...` references and temporary storage stays internal.
- Use the clearly labeled view dropdown for Raw, GUI, Focus, Light, and Dark
  controls without crowding the tmux toolbar.
- Android sideload APK wraps the private server UI with native file picking and
  task-complete notifications.
- Browser/native notifications can alert when a watched tmux task returns to
  input.
- Shared minimal icon for the browser tab, app header, and Android launcher.
- Designed for private networks, not public internet exposure.

## Distribution

- Linux quick installer:
  `curl -fsSL https://raw.githubusercontent.com/antonlobanovskiy/agent-tmux-web/main/scripts/install-linux.sh | bash`
- Public APK releases:
  `https://github.com/antonlobanovskiy/agent-tmux-web/releases`
- Full install guide: `INSTALL.md`

## Android Demo Note

The Android APK is sideload-only and generic in public builds. It should show a
setup screen where users enter their own server URL/token, then it loads the
same Raw, GUI, and Focus views shown in the browser demo. Turn on `Notify` in
the tmux toolbar to start the native foreground watcher for task-complete
alerts.

## Local Asset Generation

Generated screenshots and videos do not ship with the release. If reviewed
public demo assets would be useful, generate local candidates with:

```bash
pnpm build
pnpm capture:marketing
```

The opt-in capture script writes candidates under `docs/assets/` using
Playwright Chromium and `ffmpeg`. On a fresh machine, run
`pnpm exec playwright install chromium` if Playwright reports a missing browser.
Review every output for private data, current UI accuracy, and supportable
product claims before selecting any file for publication. Do not publish or
commit generated output by default.
