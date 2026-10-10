#!/usr/bin/env bash
# Prepare a Debian LXC (or any Debian host) to serve OpenCPAP with nginx.
#
# Runs from your workstation over SSH. Idempotent: safe to run again.
#
#   deploy/provision.sh root@192.168.1.50
#
# Requirements: key-based SSH access as root to the target (see docs/deployment.md).
set -euo pipefail

HOST="${1:?usage: deploy/provision.sh <user@host>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONF="$ROOT/deploy/nginx-opencpap.conf"
REMOTE_DIR="/var/www/opencpap"

ssh -o BatchMode=yes "$HOST" true

echo "==> Installing nginx and rsync on $HOST"
ssh -o BatchMode=yes "$HOST" 'export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq nginx rsync curl >/dev/null
  mkdir -p /var/www/opencpap'

echo "==> Installing the nginx site configuration"
scp -q -o BatchMode=yes "$CONF" "$HOST:/etc/nginx/sites-available/opencpap"
ssh -o BatchMode=yes "$HOST" 'set -e
  ln -sf /etc/nginx/sites-available/opencpap /etc/nginx/sites-enabled/opencpap
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable nginx
  systemctl reload-or-restart nginx'

echo "==> Done. The web root is $REMOTE_DIR; now run deploy/deploy.sh $HOST"
