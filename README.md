# Agent Tmux Web

<p>
  <img src="./public/agent-tmux-logo.png" alt="" width="72">
</p>

Run long-lived Codex, Claude, Gemini, and custom terminal agents from your
phone or desktop while tmux keeps the real processes alive on your server.

Agent Tmux Web is a private browser control surface for tmux-backed agent
sessions. It is useful when SSH on a phone is too cramped, when mobile browsers
disconnect, or when you want one place to switch between several terminal-agent
tabs without killing the work.

## Demo

![Agent Tmux Web showcase](./docs/assets/agent-tmux-web-showcase.gif)

[MP4 showcase](./docs/assets/agent-tmux-web-showcase.mp4)

The generated showcase covers the mobile GUI, Focus overview, stable scrollback,
TTY capture, raw tmux attach, launcher menu, light/dark mode, Android wrapper,
and desktop layout.

## Screenshots

<p>
  <img src="./docs/assets/desktop-overview.png" alt="Desktop Agent Tmux Web overview" width="780">
</p>

<p>
  <img src="./docs/assets/mobile-chat.png" alt="Mobile GUI chat mode" width="240">
  <img src="./docs/assets/mobile-focus.png" alt="Mobile focus overview" width="240">
  <img src="./docs/assets/mobile-raw-terminal.png" alt="Mobile raw tmux terminal" width="240">
</p>

<p>
  <img src="./docs/assets/modes-overview.png" alt="Focus, GUI, TTY, and raw tmux modes" width="780">
</p>

## What You Get

- Long-running tmux sessions that survive browser disconnects and phone sleep.
- Mobile-friendly session switching, creation, destruction, and launcher
  controls.
- Built-in launchers for Codex, Claude, Gemini, plus custom commands.
- GUI mode for readable chat-style agent output.
- TTY mode for plain tmux pane capture.
- Raw mode for direct interactive tmux control, including shell and TUI work.
- Focus mode for quick phone check-ins without defaulting away from the detailed
  view.
- Green/yellow/red status dots for running, waiting/idle, and error sessions.
- Stable scrollback while new tmux output continues arriving.
- File uploads and pasted clipboard images from Android, iOS, or desktop
  browsers to temporary server paths.
- Browser and Android notifications when watched tasks return to a prompt.
- Light and dark themes.
- Generic public Android APK plus optional private APK builds for your own
  server URL.

## How It Works

```text
phone or desktop browser
        |
        | private HTTP over localhost, SSH tunnel, LAN, VPN, or Tailscale
        v
Agent Tmux Web server
        |
        v
tmux sessions running Codex, Claude, Gemini, shells, or custom CLIs
```

The web UI does not host an AI service. It sends keys to tmux, captures pane
output, uploads temporary files, and watches for task-complete prompts. Your
agent CLIs and credentials stay on your server.

## Requirements

- Linux, macOS, or a Unix-like server with `tmux`
- Node.js 22+
- `pnpm`
- `git`
- At least one terminal agent command, such as `codex`, `claude`, `gemini`, or
  your own script
- Optional but recommended for phone use: Tailscale, a VPN, an SSH tunnel, LAN
  access, or an authenticated reverse proxy

## Quick Install

On Linux, inspect the installer:

```bash
curl -fsSL https://raw.githubusercontent.com/antonlobanovskiy/agent-tmux-web/main/scripts/install-linux.sh
```

Run it:

```bash
curl -fsSL https://raw.githubusercontent.com/antonlobanovskiy/agent-tmux-web/main/scripts/install-linux.sh | bash
```

The installer clones or updates the app, installs dependencies, builds the
server, writes a private `.env` with a generated auth token, and starts a
systemd user service when available.

Bind to a private network address when you want phone access:

```bash
HOST=100.x.y.z CLI_WEB_DEFAULT_CWD="$HOME/dev" \
  bash <(curl -fsSL https://raw.githubusercontent.com/antonlobanovskiy/agent-tmux-web/main/scripts/install-linux.sh)
```

Use `HOST=127.0.0.1` for local-only or SSH tunnel access. Use a Tailscale IP,
tailnet DNS name, LAN IP, or private reverse proxy for phone access. Do not bind
this app directly to the public internet.

More install detail: [INSTALL.md](./INSTALL.md)

## Manual Setup

```bash
git clone https://github.com/antonlobanovskiy/agent-tmux-web.git
cd agent-tmux-web
pnpm install
cp .env.example .env
pnpm build
HOST=127.0.0.1 PORT=6174 pnpm start
```

Open `http://127.0.0.1:6174`.

For another device, set `HOST` to a private reachable address and set an auth
token:

```bash
export AGENT_TMUX_WEB_AUTH_TOKEN="$(openssl rand -hex 32)"
HOST=100.x.y.z PORT=6174 pnpm start
```

Open:

```text
http://100.x.y.z:6174/?token=<generated-token>
```

For AI-assisted setup, give your assistant [AI_SETUP.md](./AI_SETUP.md). It is a
checklist for installing privately, verifying tmux, launchers, uploads, raw
mode, and notifications.

## Using The App

1. Pick or create a tmux session from the session list.
2. Choose a launcher such as `Codex`, `Claude`, `Gemini`, or `Custom`.
3. Press `Run`, or type directly into the tmux input.
4. Use `GUI` for readable agent output, `TTY` for plain pane text, and `Raw`
   when you need exact terminal input.
5. Turn on `Notify` when you want task-done alerts.
6. Use the paperclip button to upload files, or paste clipboard images directly
   into the chat input. Uploaded files are inserted as temporary server paths in
   prompts.

Status dots:

- Green: the selected tmux pane looks actively running.
- Yellow: idle, waiting for input, asking a question, or needing permission.
- Red: recent captured output looks like an error.

The top overview summarizes the selected session and shows recent attention
targets from other sessions without repeating the selected session.

## Android App

The Android app in [android/](./android) is a native WebView wrapper for your
running Agent Tmux Web server. It does not run tmux or agent CLIs on the phone.

Public builds are generic and open to a setup screen. Enter your own server URL
and optional token on-device:

```bash
pnpm android:build:public
```

The APK is written to:

```text
android/app/build/outputs/apk/release/agent-tmux-web-v<version>-release.apk
```

Google Play upload bundles:

```bash
pnpm android:build:play
```

Private personal APKs can prefill your server URL/token and use a separate
package id so they install next to the public app:

```bash
pnpm android:build:private
```

Do not email APKs or ZIPs containing APKs; many clients block them. For private
delivery, serve the APK from your Agent Tmux Web server over LAN, VPN, or
Tailscale:

```bash
pnpm android:stage-apk android/app/build/outputs/apk/release/agent-tmux-web-v<version>-release.apk
```

Android details: [android/README.md](./android/README.md)<br>
Play Store checklist: [docs/play-store.md](./docs/play-store.md)

## Configuration

Copy `.env.example` or set variables in your service manager.

Common variables:

- `HOST`: HTTP bind host. Defaults to `127.0.0.1`.
- `PORT`: HTTP port. Defaults to `6174`.
- `CLI_WEB_DEFAULT_CWD`: working directory for new tmux sessions.
- `CLI_WEB_TOOLS`: JSON launcher list.
- `AGENT_TMUX_WEB_AUTH_TOKEN`: optional shared token for browser access.
- `AGENT_TMUX_WEB_JSON_LIMIT`: request body limit for large pasted prompts and
  tmux sends. Defaults to `25mb`.
- `AGENT_TMUX_WEB_UPLOAD_DIR`: upload directory. Defaults to
  `/tmp/agent-tmux-web/uploads`.
- `AGENT_TMUX_WEB_UPLOAD_TTL_MS`: upload expiry. Defaults to 24 hours.
- `CODEX_APP_SERVER_PORT`: optional Codex app-server port.
- `CODEX_APP_SERVER_AUTOSTART`: set to `1` to start Codex app-server on boot.

Example launcher config:

```json
[
  {
    "id": "codex",
    "label": "Codex",
    "command": "codex",
    "defaultSessionName": "codex",
    "modes": [{ "id": "yolo", "label": "Yolo", "args": "--yolo" }]
  },
  { "id": "claude", "label": "Claude", "command": "claude", "defaultSessionName": "claude" },
  { "id": "gemini", "label": "Gemini", "command": "gemini", "defaultSessionName": "gemini" }
]
```

Use `modes` for reusable flags. Use `Custom` in the UI for one-off commands such
as:

```bash
codex -C /workspace/project -m gpt-5.5
```

## systemd

`ops/systemd/agent-tmux-web.service` is an example user service. Before
installing it, edit `WorkingDirectory`, `HOST`, `PORT`, and any environment
values for your machine.

```bash
mkdir -p ~/.config/systemd/user
cp ops/systemd/agent-tmux-web.service ~/.config/systemd/user/agent-tmux-web.service
systemctl --user daemon-reload
systemctl --user enable --now agent-tmux-web.service
```

Check it:

```bash
systemctl --user status agent-tmux-web.service --no-pager
journalctl --user -u agent-tmux-web.service -n 100 --no-pager
```

## Source Registry

This repo ships a shadcn-compatible GitHub source registry for discovery,
inspection, dry runs, and agent-assisted source adaptation:

```bash
pnpm dlx shadcn@latest list antonlobanovskiy/agent-tmux-web
pnpm dlx shadcn@latest search antonlobanovskiy/agent-tmux-web --query tmux
pnpm dlx shadcn@latest view antonlobanovskiy/agent-tmux-web/full-project
pnpm dlx shadcn@latest add antonlobanovskiy/agent-tmux-web/full-project --dry-run
```

Registry items:

- `full-project`
- `web-app`
- `vps-deploy`
- `android-wrapper`
- `notifications`

The registry is source-oriented and intentionally omits binary media assets,
launcher images, and the Gradle wrapper jar. Clone the repository when you need
the complete asset set.

Registry details: [docs/registry.md](./docs/registry.md)

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

Run locally:

```bash
HOST=127.0.0.1 PORT=6174 pnpm start
```

Open demo mode without touching real tmux sessions:

```text
http://127.0.0.1:6174/?demo=1
```

Regenerate README screenshots and showcase media:

```bash
pnpm build
pnpm capture:marketing
```

The capture script uses Playwright Chromium and `ffmpeg`. If Chromium is missing
on a fresh machine, run `pnpm exec playwright install chromium`.

The generated media lives in [docs/assets](./docs/assets), and the marketing
copy index is [docs/marketing.md](./docs/marketing.md).

## Versioning And Releases

Agent Tmux Web is open source. Public versions are tracked in `package.json` and
`android/app/build.gradle`; APK filenames include the version:

```text
agent-tmux-web-v<version>-release.apk
```

Public releases must stay generic. Do not commit private server URLs, auth
tokens, `.env` files, staged APKs, uploads, generated logs, machine-specific
service files, or private signing material.

Release notes: [CHANGELOG.md](./CHANGELOG.md)

## Security Notes

- Treat access to this UI as terminal access to the server user running it.
- Do not expose it directly to the public internet.
- Use localhost, SSH tunnel, LAN, VPN, Tailscale, or an authenticated reverse
  proxy.
- Set `AGENT_TMUX_WEB_AUTH_TOKEN` when anyone else can reach the bind address.
- Uploads are temporary by default and are cleaned on startup and hourly.
- Public Android builds must be created with `pnpm android:build:public` or
  `pnpm android:build:play` so no private URL/token is embedded.

Publishing or cloning this repository does not expose the maintainer's running
server, tmux sessions, uploads, `.env`, auth token, or local systemd service.

## License

MIT
