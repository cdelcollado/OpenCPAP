#!/usr/bin/env bash
# Prepare a Debian LXC (or any Debian host) to serve OpenCPAP over HTTPS with Caddy.
#
# Runs from your workstation over SSH. Idempotent: safe to run again.
#
#   deploy/provision.sh root@192.168.1.50 cpap.example.com
#
# Before running, the host needs:
#   - key-based SSH access as root (see docs/deployment.md);
#   - /etc/caddy/cloudflare.env containing CF_API_TOKEN=... (created by you on the host,
#     never committed), so the certificate can be issued;
#   - a DNS record for the domain in Cloudflare pointing to the host's LAN address,
#     with the proxy disabled ("DNS only").
set -euo pipefail

HOST="${1:?usage: deploy/provision.sh <user@host> <domain>}"
DOMAIN="${2:?usage: deploy/provision.sh <user@host> <domain>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$ROOT/deploy/Caddyfile.template"
UNIT="$ROOT/deploy/caddy.service"
REMOTE_DIR="/var/www/opencpap"

if [[ ! "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
  echo "invalid domain: '$DOMAIN'" >&2
  exit 1
fi

ssh -o BatchMode=yes "$HOST" true

echo "==> Checking the Cloudflare token file on $HOST"
ssh -o BatchMode=yes "$HOST" 'test -s /etc/caddy/cloudflare.env && grep -q "^CF_API_TOKEN=." /etc/caddy/cloudflare.env' || {
  echo "missing /etc/caddy/cloudflare.env with CF_API_TOKEN=... on $HOST" >&2
  echo "create it on the host (chmod 600) and run this script again" >&2
  exit 1
}

echo "==> Installing rsync, curl and the web root"
ssh -o BatchMode=yes "$HOST" 'export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq rsync curl ca-certificates >/dev/null
  mkdir -p /var/www/opencpap /etc/caddy'

echo "==> Installing Caddy with the Cloudflare DNS plugin"
ssh -o BatchMode=yes "$HOST" 'set -e
  if ! /usr/bin/caddy list-modules 2>/dev/null | grep -q dns.providers.cloudflare; then
    curl -fsSL -o /usr/bin/caddy.new "https://caddyserver.com/api/download?os=linux&arch=amd64&p=github.com/caddy-dns/cloudflare"
    chmod 755 /usr/bin/caddy.new
    mv /usr/bin/caddy.new /usr/bin/caddy
  fi
  /usr/bin/caddy version'

echo "==> Stopping nginx if it is still installed"
ssh -o BatchMode=yes "$HOST" 'if systemctl list-unit-files nginx.service >/dev/null 2>&1; then
  systemctl disable --now nginx || true
fi'

echo "==> Installing the Caddyfile and the service for $DOMAIN"
sed "s/__DOMAIN__/$DOMAIN/" "$TEMPLATE" | ssh -o BatchMode=yes "$HOST" 'cat > /etc/caddy/Caddyfile'
scp -q -o BatchMode=yes "$UNIT" "$HOST:/etc/systemd/system/caddy.service"
ssh -o BatchMode=yes "$HOST" 'set -e
  chmod 600 /etc/caddy/cloudflare.env
  # Load the token the same way the systemd unit does, so validation sees it.
  set -a; . /etc/caddy/cloudflare.env; set +a
  /usr/bin/caddy validate --config /etc/caddy/Caddyfile
  systemctl daemon-reload
  systemctl enable caddy
  systemctl restart caddy
  sleep 2
  systemctl is-active caddy'

echo "==> Done. Deploy the web app with: deploy/deploy.sh $HOST $DOMAIN"
