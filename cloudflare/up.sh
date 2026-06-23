#!/usr/bin/env bash
# Start gridlock-backend tunnel (backend must be running on GRIDLOCK_BACKEND_PORT).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/cloudflare/cloudflare.env"
CONFIG_FILE="$ROOT/cloudflare/config.yml"
LOG_DIR="$ROOT/cloudflare/logs"
PID_FILE="$LOG_DIR/tunnel.pid"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

CONFIG_FILE="${GRIDLOCK_TUNNEL_CONFIG:-$CONFIG_FILE}"
PORT="${GRIDLOCK_BACKEND_PORT:-8081}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Missing $CONFIG_FILE — run: bash cloudflare/setup-tunnel.sh" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Tunnel already running (pid $(cat "$PID_FILE"))"
  exit 0
fi

if ! curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  echo "Backend not responding on http://127.0.0.1:${PORT}/health — start it first:" >&2
  echo "  cd gridlock-backend && PORT=${PORT} npm run dev" >&2
  exit 1
fi

nohup cloudflared tunnel --config "$CONFIG_FILE" run > "$LOG_DIR/tunnel.log" 2>&1 &
echo $! > "$PID_FILE"
sleep 2

if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Tunnel started (pid $(cat "$PID_FILE"), log: $LOG_DIR/tunnel.log)"
else
  echo "Tunnel failed to start — see $LOG_DIR/tunnel.log" >&2
  tail -20 "$LOG_DIR/tunnel.log" >&2
  exit 1
fi
