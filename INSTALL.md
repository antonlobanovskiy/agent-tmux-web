# Install Agent Tmux Web

Agent Tmux Web is designed for private installs on a workstation, homelab box,
or VPS that already runs your terminal agent CLIs.

## Fast Linux Install

Inspect the installer first:

```bash
curl -fsSL https://raw.githubusercontent.com/antonlobanovskiy/agent-tmux-web/main/scripts/install-linux.sh
```

Run it:

```bash
curl -fsSL https://raw.githubusercontent.com/antonlobanovskiy/agent-tmux-web/main/scripts/install-linux.sh | bash
```

The installer:

- clones or updates the repo at `~/.local/share/agent-tmux-web`
- installs dependencies with `pnpm`
- builds the web/server bundle
- creates a private `.env` with a generated auth token
- starts a systemd user service when available
- prints the local URL with the token

Override defaults inline:

```bash
HOST=100.x.y.z CLI_WEB_DEFAULT_CWD="$HOME/dev" \
  bash <(curl -fsSL https://raw.githubusercontent.com/antonlobanovskiy/agent-tmux-web/main/scripts/install-linux.sh)
```

Use `HOST=127.0.0.1` for local-only or SSH tunnel access. Use a Tailscale IP,
tailnet DNS name, LAN IP, or a private reverse proxy when opening it from your
phone. Do not expose Agent Tmux Web directly to the public internet.

## Requirements

- Linux with `bash`
- Node.js 22+
- `pnpm`
- `git`
- `tmux`
- a terminal agent CLI such as `codex`, `claude`, `gemini`, or a custom command

If `pnpm` is not installed but `corepack` is available, the installer attempts
to enable it.

## Android APK

Download the latest public APK from
[GitHub Releases](https://github.com/antonlobanovskiy/agent-tmux-web/releases).
Public APKs are generic WebView wrappers and should open to a setup screen where
you enter your private server URL and optional auth token.

Do not email APKs or ZIP files containing APKs. Gmail and some mobile clients
block executable attachments and executable archives. For private APKs, serve
the file from your Agent Tmux Web server over LAN, VPN, or Tailscale:

```bash
pnpm android:stage-apk android/app/build/outputs/apk/release/agent-tmux-web-v<version>-release.apk
```

You can also build the APK yourself:

```bash
pnpm android:build:public
```

The generated release APK is written to:

```text
android/app/build/outputs/apk/release/agent-tmux-web-v<version>-release.apk
```

For a private APK with an embedded server URL/token and a separate package id,
use:

```bash
pnpm android:build:private
```

See [android/README.md](android/README.md) for private package ids, signing, and
APK delivery details.

## Manual Install

```bash
git clone https://github.com/antonlobanovskiy/agent-tmux-web.git
cd agent-tmux-web
pnpm install
cp .env.example .env
pnpm build
HOST=127.0.0.1 PORT=6174 pnpm start
```

Set `AGENT_TMUX_WEB_AUTH_TOKEN` before binding to any address reachable by
another device.
