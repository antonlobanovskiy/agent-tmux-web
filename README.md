# Agent Tmux Web

Mobile-friendly browser control panel for long-running terminal agent CLIs inside
tmux. It can launch and control Codex, Claude Code, or any other command-line
tool available on the server.

The app is designed for private-network access from a phone, laptop, or desktop.
Tailscale works out of the box if it is installed, but any VPN, SSH tunnel,
reverse proxy, or LAN binding can be used.

## Features

- Lists tmux sessions and switches between them.
- Creates and destroys tmux sessions.
- Launches configured CLI tools inside the selected tmux session.
- Ships with default launchers for `codex --yolo` and `claude`.
- Supports custom launch commands from the UI.
- Captures tmux panes as either terminal text or a normalized chat-style view.
- Attaches a raw browser terminal to tmux for exact native CLI behavior.
- Uploads files from Android/desktop browsers to a temporary server path and
  inserts that path into the prompt.
- Optionally starts the Codex app-server for Codex-specific thread/model/skill
  APIs. The tmux workflow works without it.

## Requirements

- Node.js 22+
- pnpm
- tmux
- A CLI tool to run in tmux, such as `codex`, `claude`, `gemini`, or a shell
  script
- Optional: Tailscale or another private network path to the server

## Run

```bash
pnpm install
pnpm build
HOST=127.0.0.1 PORT=6174 pnpm start
```

Bind `HOST` to the interface you want to expose:

- `127.0.0.1` for local-only or SSH tunnel use.
- A Tailscale IP such as `100.x.y.z` for tailnet-only access.
- `0.0.0.0` only behind a firewall, VPN, or authenticated reverse proxy.

When exposing the app beyond a trusted private network, set
`AGENT_TMUX_WEB_AUTH_TOKEN` and pass `?token=...` in the URL.

## Configuration

Copy `.env.example` or set environment variables in your service manager.

Useful variables:

- `HOST`: HTTP bind host. Defaults to `127.0.0.1`.
- `PORT`: HTTP port. Defaults to `6174`.
- `CLI_WEB_DEFAULT_CWD`: working directory used for new tmux sessions.
- `CLI_WEB_TOOLS`: JSON array of launchers shown in the tmux menu.
- `AGENT_TMUX_WEB_AUTH_TOKEN`: optional shared token for browser access.
- `AGENT_TMUX_WEB_UPLOAD_DIR`: optional upload directory. Defaults to
  `/tmp/agent-tmux-web/uploads`.
- `AGENT_TMUX_WEB_UPLOAD_TTL_MS`: upload expiry. Defaults to 24 hours.
- `CODEX_APP_SERVER_PORT`: optional Codex app-server port.
- `CODEX_APP_SERVER_AUTOSTART`: set to `1` to start Codex app-server on boot.

Example `CLI_WEB_TOOLS`:

```json
[
  { "id": "codex", "label": "Codex", "command": "codex --yolo", "defaultSessionName": "codex" },
  { "id": "claude", "label": "Claude", "command": "claude", "defaultSessionName": "claude" },
  { "id": "gemini", "label": "Gemini", "command": "gemini", "defaultSessionName": "gemini" }
]
```

## systemd

`ops/systemd/agent-tmux-web.service` is an example user service. Before installing
it, change `WorkingDirectory`, `HOST`, and any environment values for your
machine.

```bash
mkdir -p ~/.config/systemd/user
cp ops/systemd/agent-tmux-web.service ~/.config/systemd/user/agent-tmux-web.service
systemctl --user daemon-reload
systemctl --user enable --now agent-tmux-web.service
```

## Security Notes

- Do not expose this app directly to the public internet.
- Treat browser access as terminal access to the server user running the app.
- Use a VPN, SSH tunnel, or authenticated reverse proxy.
- Set `AGENT_TMUX_WEB_AUTH_TOKEN` if the app can be reached by anyone else.
- Uploads are temporary by default and are cleaned on startup and hourly.
- Do not commit local `.env` files, uploads, build output, or service files with
  real IPs, usernames, tokens, or private paths.

## License

MIT
