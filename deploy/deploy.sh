#!/usr/bin/env bash
# Build the web app and publish it to a host prepared by deploy/provision.sh.
#
#   deploy/deploy.sh root@192.168.1.50
#
# Environment:
#   SKIP_BUILD=1   publish the existing apps/web/dist without rebuilding
#
# The remote directory is always replaced (rsync --delete), so it must only
# ever contain the built app.
set -euo pipefail

HOST="${1:?usage: deploy/deploy.sh <user@host>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_DIR="/var/www/opencpap"
DIST="$ROOT/apps/web/dist"

if [[ -z "$REMOTE_DIR" || "$REMOTE_DIR" == "/" ]]; then
  echo "refusing to sync to an unsafe remote directory: '$REMOTE_DIR'" >&2
  exit 1
fi

ssh -o BatchMode=yes "$HOST" true

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "==> Building the web app"
  (cd "$ROOT" && npm run build -w @opencpap/web)
fi

if [[ ! -f "$DIST/index.html" ]]; then
  echo "no build found in $DIST (run without SKIP_BUILD=1)" >&2
  exit 1
fi

echo "==> Syncing $DIST to $HOST:$REMOTE_DIR"
rsync -av --delete -e "ssh -o BatchMode=yes" "$DIST/" "$HOST:$REMOTE_DIR/" >/dev/null

echo "==> Checking the site from inside the host"
ssh -o BatchMode=yes "$HOST" 'set -e
  curl -sfo /dev/null http://localhost/
  curl -sfo /dev/null http://localhost/manifest.webmanifest
  curl -sfo /dev/null http://localhost/sw.js
  printf "index: %s\nmanifest: %s\n" \
    "$(curl -s -o /dev/null -w "%{http_code} %{content_type}" http://localhost/)" \
    "$(curl -s -o /dev/null -w "%{http_code} %{content_type}" http://localhost/manifest.webmanifest)"'

echo "==> Deployed. Open http://${HOST#*@}/ in a browser on the local network."
