# AI Setup Guide

Use this file when an AI assistant is helping someone install Agent Tmux Web on a
server. The goal is a working private browser UI for tmux-backed terminal agents
with minimal back-and-forth.

## Copy-Paste Prompt

```text
Please read AI_SETUP.md in this repository and set up Agent Tmux Web on this
server. Keep it private, verify it works locally first, then help me expose it
through Tailscale, a VPN, an SSH tunnel, or another private network path.
```

## What You Are Installing

Agent Tmux Web is a Node/Vite/Express app that controls tmux sessions from a
browser. The terminal agents run on the server inside tmux; the browser is only
the control surface.

Do not expose it directly to the public internet. Treat access to this app as
terminal access to the server user running it.

Publishing or cloning this repository does not expose the maintainer's server,
tmux sessions, uploads, `.env`, auth token, or local service files. Each
deployment is separate. Keep user-specific runtime config out of git.

## Assistant Checklist

1. Inspect the repository.
   - Read `README.md`, `.env.example`, and `ops/systemd/agent-tmux-web.service`.
   - Check `package.json` for scripts and Node requirements.
   - Do not commit local `.env`, upload folders, generated logs, tokens, or
     machine-specific service edits.

2. Check server prerequisites.
   - `node --version` should be Node 22 or newer.
   - `pnpm --version` should be available.
   - `tmux -V` should be available.
   - At least one terminal agent command should exist, such as `codex`,
     `claude`, `gemini`, or a user-provided command.
   - If a prerequisite is missing, explain the exact install command for the
     detected OS and ask before using `sudo`.

3. Install and build.

   ```bash
   pnpm install
   cp .env.example .env
   pnpm build
   ```

4. Configure `.env`.
   - `HOST=127.0.0.1` for local-only or SSH tunnel testing.
   - `PORT=6174` unless the port is already in use.
   - `CLI_WEB_DEFAULT_CWD` should be the directory where new tmux sessions
     should start.
   - Set `AGENT_TMUX_WEB_AUTH_TOKEN` if the app can be reached by anyone other
     than the server user. Generate it with `openssl rand -hex 32` or an
     equivalent random token generator.
   - Customize `CLI_WEB_TOOLS` only if the defaults are not enough.

5. Configure CLI launchers.

   Default launcher shape:

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

   Use `modes` for reusable flag toggles. Use the UI's `Custom` launcher for
   one-off commands with custom flags.

6. Run locally first.

   ```bash
   HOST=127.0.0.1 PORT=6174 pnpm start
   ```

   Verify:
   - `http://127.0.0.1:6174/healthz` returns OK.
   - The browser UI loads.
   - Tmux sessions list without crashing.
   - Creating a test session works.
   - Launching a configured CLI tool inserts/runs the expected command.
   - GUI, TTY, and Raw modes can be switched.

7. Expose privately.
   - Prefer Tailscale, a VPN, an SSH tunnel, LAN-only access, or an
     authenticated reverse proxy.
   - For Tailscale, bind `HOST` to the Tailscale IP or keep `127.0.0.1` behind a
     tunnel, depending on the user's preference.
   - Do not recommend `0.0.0.0` unless the user has a firewall, VPN, or
     authenticated reverse proxy in front of it.

8. Install as a user service if requested.

   ```bash
   mkdir -p ~/.config/systemd/user
   cp ops/systemd/agent-tmux-web.service ~/.config/systemd/user/agent-tmux-web.service
   systemctl --user daemon-reload
   systemctl --user enable --now agent-tmux-web.service
   systemctl --user status agent-tmux-web.service
   ```

   Before enabling the service, edit:
   - `WorkingDirectory`
   - `HOST`
   - `PORT`
   - `CLI_WEB_DEFAULT_CWD`
   - `CLI_WEB_TOOLS`
   - `AGENT_TMUX_WEB_AUTH_TOKEN`

9. Final verification.
   - Open the app from the target device.
   - Create or select a tmux session.
   - Send a short prompt through the input.
   - Attach Raw mode, then detach and confirm tmux size is restored.
   - Enable notifications with the bell button if the user wants done alerts.
     Browser installs need HTTPS or localhost; the Android wrapper can use its
     native notification bridge against the private server URL.
   - Confirm uploads use a temporary server path and are not kept forever.
   - If setting up Android for one private device, build `pnpm android:build`,
     install the APK from `android/app/build/outputs/apk/release/app-release.apk`,
     and point the setup screen at the private server URL.
   - If creating an APK to share or upload publicly, build
     `pnpm android:build:public`. Do not share APKs built with
     `android/local.properties` because they may embed a private URL/token.

10. Handoff summary.
    - URL to open.
    - Whether a token is required.
    - How to restart the service.
    - Where `.env` or the systemd service was configured.
    - Which CLI launchers are available.
    - Any missing optional tools.

## Troubleshooting

- `tmux list-sessions` fails with "no server running": this is OK before any
  sessions exist.
- Browser loads but API fails: check `HOST`, `PORT`, auth token, and reverse
  proxy headers.
- Phone cannot connect: verify bind address, firewall, Tailscale/VPN reachability,
  and whether the URL needs `?token=...`.
- Raw terminal acts resized after detach: detach from the UI, then check for
  active tmux clients with `tmux list-clients`.
- Notifications do not fire: permission must be granted from the bell button,
  and the app must see a send/run action before it watches for idle. On Android,
  leave the foreground watcher notification enabled.
- Public APK contains a private URL/token: rebuild with
  `pnpm android:build:public` and verify `android/local.properties` values were
  not used.
- CLI launcher does nothing: verify the command exists in the server user's
  `PATH`, not just in an interactive shell.
