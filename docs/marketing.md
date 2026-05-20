# Marketing Kit

## One-Liner

Agent Tmux Web lets you run Codex, Claude, Gemini, and custom terminal agents
from your phone while tmux keeps the real sessions alive on your server.

## Short Description

Run long agent sessions from your phone without keeping SSH open. Agent Tmux Web
solves the mobile terminal problem by separating the agent process from the
browser: tmux owns the session, while the web UI handles session switching, CLI
launchers, readable chat capture, stable scrollback, raw terminal attach, and
temporary file uploads over a private network path.

## Key Points

- Mobile-first tmux control for terminal agents.
- Launch Codex, Claude Code, Gemini, or custom commands.
- Switch between normalized chat capture and raw tmux terminal mode.
- Scroll back through active sessions without losing your place, then jump back
  to latest output when ready.
- Force Sync manually refreshes the captured pane without attaching to tmux.
- Upload files from Android or desktop browsers to temporary server paths.
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

## Assets

- Showcase GIF: `docs/assets/agent-tmux-web-showcase.gif`
- Showcase MP4: `docs/assets/agent-tmux-web-showcase.mp4`
- Showcase poster: `docs/assets/agent-tmux-web-showcase-poster.png`
- Compact modes overview: `docs/assets/modes-overview.png`
- Mobile chat screenshot: `docs/assets/mobile-chat.png`
- Mobile scroll control screenshot: `docs/assets/mobile-scroll.png`
- Mobile TTY screenshot: `docs/assets/mobile-tty.png`
- Mobile launcher menu: `docs/assets/mobile-launchers.png`
- Mobile Claude launcher: `docs/assets/mobile-claude.png`
- Raw tmux mode screenshot: `docs/assets/mobile-raw-terminal.png`
- Desktop overview: `docs/assets/desktop-overview.png`

## Android Demo Note

The Android APK is sideload-only and generic in public builds. It should show a
setup screen where users enter their own server URL/token, then it loads the
same GUI/TTY/raw tmux modes shown in the browser demo. Turn on `Notify` in the
tmux toolbar to start the native foreground watcher for task-complete alerts.

Regenerate assets with:

```bash
pnpm build
pnpm capture:marketing
```
