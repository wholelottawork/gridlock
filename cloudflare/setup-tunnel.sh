#!/usr/bin/env bash
# One-time Cloudflare Tunnel setup for gridlock-backend.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/cloudflare/cloudflare.env"
CONFIG_DIR="$ROOT/cloudflare"
CONFIG_FILE="$CONFIG_DIR/config.yml"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found. Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$CONFIG_DIR/cloudflare.env.example" "$ENV_FILE"
  echo "Created $ENV_FILE — edit GRIDLOCK_TUNNEL_HOSTNAME if needed, then re-run." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${GRIDLOCK_TUNNEL_HOSTNAME:?Set GRIDLOCK_TUNNEL_HOSTNAME in $ENV_FILE}"
GRIDLOCK_TUNNEL_NAME="${GRIDLOCK_TUNNEL_NAME:-gridlock-api}"
GRIDLOCK_BACKEND_PORT="${GRIDLOCK_BACKEND_PORT:-8081}"

mkdir -p "$CONFIG_DIR"

if [[ ! -f "$HOME/.cloudflared/cert.pem" ]]; then
  echo "Cloudflare login required — open the URL cloudflared prints in your browser."
  cloudflared tunnel login
fi

if [[ ! -f "$CONFIG_DIR/tunnel-id" ]]; then
  echo "Creating tunnel: $GRIDLOCK_TUNNEL_NAME"
  cloudflared tunnel create "$GRIDLOCK_TUNNEL_NAME" | tee "$CONFIG_DIR/create.log"
  TUNNEL_ID="$(cloudflared tunnel list --output json | GRIDLOCK_TUNNEL_NAME="$GRIDLOCK_TUNNEL_NAME" python3 -c '
import json, os, sys
name = os.environ["GRIDLOCK_TUNNEL_NAME"]
rows = json.load(sys.stdin)
match = [r for r in rows if r.get("name") == name]
if not match:
    sys.exit("tunnel not found after create")
print(match[0]["id"])
')"
  echo "$TUNNEL_ID" > "$CONFIG_DIR/tunnel-id"
else
  TUNNEL_ID="$(cat "$CONFIG_DIR/tunnel-id")"
fi

CREDS="$HOME/.cloudflared/${TUNNEL_ID}.json"
if [[ ! -f "$CREDS" ]]; then
  echo "Missing credentials file: $CREDS" >&2
  exit 1
fi

cat > "$CONFIG_FILE" <<EOF
tunnel: $TUNNEL_ID
credentials-file: $CREDS

ingress:
  - hostname: $GRIDLOCK_TUNNEL_HOSTNAME
    service: http://127.0.0.1:$GRIDLOCK_BACKEND_PORT
  - service: http_status:404
EOF

echo "Routing DNS: $GRIDLOCK_TUNNEL_HOSTNAME → tunnel $GRIDLOCK_TUNNEL_NAME"
if ! cloudflared tunnel route dns "$GRIDLOCK_TUNNEL_NAME" "$GRIDLOCK_TUNNEL_HOSTNAME"; then
  echo
  echo "WARNING: DNS route failed. Ensure ${GRIDLOCK_TUNNEL_HOSTNAME#*.} is added to Cloudflare"
  echo "         with nameservers pointed to Cloudflare, then re-run this script."
  echo
fi

grep -q '^GRIDLOCK_TUNNEL_ID=' "$ENV_FILE" 2>/dev/null || cat >> "$ENV_FILE" <<EOF

# Added by setup-tunnel.sh
GRIDLOCK_TUNNEL_ID=$TUNNEL_ID
GRIDLOCK_TUNNEL_CREDENTIALS=$CREDS
GRIDLOCK_TUNNEL_CONFIG=$CONFIG_FILE
EOF

echo
echo "Tunnel ready."
echo "  Config:   $CONFIG_FILE"
echo "  Hostname: https://$GRIDLOCK_TUNNEL_HOSTNAME"
echo
echo "Next: bash cloudflare/up.sh"
