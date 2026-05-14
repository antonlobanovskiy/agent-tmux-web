# Marketing Kit

## One-Liner

Agent Tmux Web lets you run Codex, Claude, Gemini, and custom terminal agents
from your phone while tmux keeps the real sessions alive on your server.

## Short Description

Run long agent sessions from your phone without keeping SSH open. Agent Tmux Web
solves the mobile terminal problem by separating the agent process from the
browser: tmux owns the session, while the web UI handles session switching, CLI
launchers, readable chat capture, raw terminal attach, and temporary file
uploads over a private network path.

## Key Points

- Mobile-first tmux control for terminal agents.
- Launch Codex, Claude Code, Gemini, or custom commands.
- Switch between normalized chat capture and raw tmux terminal mode.
- Upload files from Android or desktop browsers to temporary server paths.
- Designed for private networks, not public internet exposure.

## Assets

- Showcase GIF: `docs/assets/agent-tmux-web-showcase.gif`
- Showcase MP4: `docs/assets/agent-tmux-web-showcase.mp4`
- Showcase poster: `docs/assets/agent-tmux-web-showcase-poster.png`
- Mobile chat screenshot: `docs/assets/mobile-chat.png`
- Mobile launcher menu: `docs/assets/mobile-launchers.png`
- Mobile Claude launcher: `docs/assets/mobile-claude.png`
- Raw tmux mode screenshot: `docs/assets/mobile-raw-terminal.png`
- Desktop overview: `docs/assets/desktop-overview.png`

Regenerate assets with:

```bash
pnpm build
pnpm capture:marketing
```
