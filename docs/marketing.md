# Marketing Kit

## One-Liner

Agent Tmux Web lets you run coding-agent CLIs from your phone while tmux keeps
the real sessions alive on your server.

## Short Description

Run long agent sessions from your phone without keeping SSH open. Agent Tmux Web
solves the mobile terminal problem by separating the agent process from the
browser: tmux owns the session, while the web UI handles session switching, CLI
launchers, selectable TTY capture, status indicators, stable scrollback, raw terminal
attach, and temporary file uploads over a private network path.

## Key Points

- Mobile-first tmux control for terminal agents.
- Launch OpenCode, Codex, Claude Code, Gemini CLI, GitHub Copilot, Cursor
  Agent, Qwen Code, Cline, Aider, goose, Amp, or custom commands.
- Browse launchers alphabetically, pin favorites to the top, and save named
  custom commands locally with the `+` control.
- Use grouped launcher modes for Default, Plan, Auto, Auto Edit, Autopilot, and
  Yolo presets without stacking incompatible permission modes.
- Start in selectable TTY and toggle to Raw for direct tmux terminal control.
- Use session status dots to see which tmux tab is running, waiting, or failing.
- Scroll back through active sessions without losing your place, then jump back
  to latest output when ready.
- Refresh updates the session list and current view without attaching to tmux.
- Upload files from Android or desktop browsers while local CLIs receive safe
  `~/.agent-tmux/attachments/...` references and temporary storage stays internal.
- Use the direct TTY/Raw view toggle. Default-view, per-session memory, theme,
  and connection controls live in Settings.
- Android sideload APK wraps the private server UI with native file picking and
  confirmed input-needed and idle notifications.
- Browser/native notifications can alert when a session needs input or becomes
  idle.
- Shared minimal icon for the browser tab, app header, and Android launcher.
- Designed for private networks, not public internet exposure.

## Distribution

- Linux quick installer:
  `curl -fsSL https://raw.githubusercontent.com/antonlobanovskiy/agent-tmux-web/main/scripts/install-linux.sh | bash`
- Public APK releases:
  `https://github.com/antonlobanovskiy/agent-tmux-web/releases`
- Full install guide: `INSTALL.md`

## Android Demo Note

The public Android APK is generic and can be sideloaded from GitHub Releases.
The repository can also build an AAB for Play testing once an upload key is
configured. Both formats show a setup screen where users enter their own server URL/token, then load the
same TTY and Raw views shown in the browser demo. Turn on the bell in the tmux
toolbar to start the native foreground watcher for input-needed and idle alerts.

## Local Asset Generation

The reviewed public inventory is:

- `docs/assets/agent-tmux-web-hero.png`
- `docs/assets/desktop-tty.png`
- `docs/assets/mobile-tty.png`
- `docs/assets/mobile-raw.png`
- `docs/assets/modes-overview.png`
- `docs/assets/agent-tmux-web-showcase-poster.png`
- `docs/assets/agent-tmux-web-showcase.mp4`

Regenerate local candidates with:

```bash
pnpm build
pnpm capture:marketing
```

Run capture only against loopback demo mode, never real tmux sessions. The
product UI must come from that demo; image generation may be used only for the
non-product backdrop. The opt-in capture script writes candidates under
`docs/assets/` using Playwright Chromium and `ffmpeg`. On a fresh machine, run
`pnpm exec playwright install chromium` if Playwright reports a missing browser.
Before commit, visually inspect every output, scan its metadata, and complete a
privacy and copy review for private data, current UI accuracy, and supportable
product claims.
