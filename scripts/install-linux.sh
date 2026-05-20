#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${AGENT_TMUX_WEB_REPO:-https://github.com/antonlobanovskiy/agent-tmux-web.git}"
INSTALL_DIR="${AGENT_TMUX_WEB_DIR:-$HOME/.local/share/agent-tmux-web}"
SERVICE_NAME="${AGENT_TMUX_WEB_SERVICE_NAME:-agent-tmux-web}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-6174}"
CODEX_APP_SERVER_PORT="${CODEX_APP_SERVER_PORT:-43117}"
CODEX_APP_SERVER_AUTOSTART="${CODEX_APP_SERVER_AUTOSTART:-0}"
CLI_WEB_DEFAULT_CWD="${CLI_WEB_DEFAULT_CWD:-$HOME}"

fail() {
  printf 'agent-tmux-web install failed: %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

generate_token() {
  if [ -n "${AGENT_TMUX_WEB_AUTH_TOKEN:-}" ]; then
    printf '%s\n' "$AGENT_TMUX_WEB_AUTH_TOKEN"
    return
  fi
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi
  if command -v node >/dev/null 2>&1; then
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    return
  fi
  fail "need openssl or node to generate AGENT_TMUX_WEB_AUTH_TOKEN"
}

case "$INSTALL_DIR" in
  *[[:space:]]*) fail "AGENT_TMUX_WEB_DIR cannot contain whitespace: $INSTALL_DIR" ;;
esac

need_cmd git
need_cmd node
need_cmd tmux

if ! command -v pnpm >/dev/null 2>&1 && command -v corepack >/dev/null 2>&1; then
  corepack enable pnpm >/dev/null 2>&1 || corepack enable >/dev/null 2>&1 || true
fi
need_cmd pnpm

if [ -d "$INSTALL_DIR/.git" ]; then
  printf 'Updating %s\n' "$INSTALL_DIR"
  git -C "$INSTALL_DIR" fetch --tags origin
  git -C "$INSTALL_DIR" pull --ff-only
elif [ -e "$INSTALL_DIR" ] && [ "$(find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 | head -n 1)" ]; then
  fail "$INSTALL_DIR exists and is not an empty git checkout"
else
  printf 'Cloning %s into %s\n' "$REPO_URL" "$INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
printf 'Installing dependencies and building Agent Tmux Web\n'
pnpm install --frozen-lockfile
pnpm build

env_file="$INSTALL_DIR/.env"
if [ -f "$env_file" ]; then
  printf 'Keeping existing %s\n' "$env_file"
  token="$(sed -n 's/^AGENT_TMUX_WEB_AUTH_TOKEN=//p' "$env_file" | tail -n 1)"
else
  token="$(generate_token)"
  cat >"$env_file" <<EOF
HOST=$HOST
PORT=$PORT
CODEX_APP_SERVER_PORT=$CODEX_APP_SERVER_PORT
CODEX_APP_SERVER_AUTOSTART=$CODEX_APP_SERVER_AUTOSTART
CLI_WEB_DEFAULT_CWD=$CLI_WEB_DEFAULT_CWD
AGENT_TMUX_WEB_AUTH_TOKEN=$token
EOF
  chmod 600 "$env_file"
fi

pnpm_path="$(command -v pnpm)"
service_dir="$HOME/.config/systemd/user"
service_file="$service_dir/$SERVICE_NAME.service"

if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
  mkdir -p "$service_dir"
  cat >"$service_file" <<EOF
[Unit]
Description=Agent Tmux Web
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$env_file
Environment=PATH=$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$pnpm_path start
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now "$SERVICE_NAME.service"
  printf 'Started systemd user service: %s\n' "$SERVICE_NAME.service"
else
  printf 'systemd user services are not available in this shell.\n'
  printf 'Start manually with:\n'
  printf '  cd %s && set -a && . ./.env && set +a && pnpm start\n' "$INSTALL_DIR"
fi

display_host="$HOST"
if [ "$display_host" = "0.0.0.0" ]; then
  display_host="<server-ip-or-tailnet-name>"
fi

printf '\nAgent Tmux Web is installed at %s\n' "$INSTALL_DIR"
printf 'Open: http://%s:%s/?token=%s\n' "$display_host" "$PORT" "${token:-<existing-token-in-.env>}"
