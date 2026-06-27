#!/bin/bash
set -e

# Load local deployment configuration (git-ignored; see deploy.env.example).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/deploy.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Missing deploy.env. Copy deploy.env.example to deploy.env and fill in your values." >&2
  exit 1
fi
set -a; . "$ENV_FILE"; set +a

NAS_USER="${NAS_USER:?set NAS_USER in deploy.env}"
NAS_HOST="${NAS_HOST:?set NAS_HOST in deploy.env}"
DEPLOY_TARGET="${DEPLOY_TARGET:?set DEPLOY_TARGET in deploy.env}"
NGINX_DIR="${NGINX_DIR:?set NGINX_DIR in deploy.env}"
SOURCE_DIR="./dist/"
SSH_OPTS="-o RemoteCommand=none -o RequestTTY=no"

# Container lifecycle is owned by a separate NAS toolkit (nasctl) kept outside
# this repo. We only need it here to reload nginx after pushing a new config.
NASCTL="$(command -v nasctl || true)"
: "${NASCTL:=${NASCTL_PATH:-}}"

# Sync content from Obsidian vault
echo "📥 Syncing content from vault..."
./scripts/sync-content.sh

# Build the site
echo "🔨 Building site..."
npm run build

# Deploy via rsync over SSH (Tailscale)
echo "🚀 Deploying to $NAS_HOST:$DEPLOY_TARGET ..."

rsync -avz --delete \
  --exclude='.DS_Store' \
  -e "ssh -o RemoteCommand=none -o RequestTTY=no" \
  "$SOURCE_DIR" "$NAS_USER@$NAS_HOST:$DEPLOY_TARGET/"

# Sync nginx config (AI/scraper blocking + rate limiting), then ask nginx to
# reload it via the generic NAS toolkit. The container itself (compose.yaml) is
# managed by nasctl; here we only push the config file + reload. Best-effort —
# failures never fail the site deploy.
echo "🛡️  Syncing nginx config..."
if ssh $SSH_OPTS "$NAS_USER@$NAS_HOST" "mkdir -p $NGINX_DIR" \
  && rsync -avz -e "ssh $SSH_OPTS" ./nginx/default.conf "$NAS_USER@$NAS_HOST:$NGINX_DIR/default.conf"; then
  if [ -x "$NASCTL" ]; then
    if "$NASCTL" ctl webserver_nginx exec nginx -t \
      && "$NASCTL" ctl webserver_nginx exec nginx -s reload; then
      echo "✅ nginx config reloaded."
    else
      echo "⚠️  nginx reload failed. First-time activation of the mounted config? Run:"
      echo "       nasctl stack webserver recreate"
    fi
  else
    echo "ℹ️  nginx config pushed, but nasctl was not found. Reload it with:"
    echo "       nasctl ctl webserver_nginx exec nginx -s reload"
    echo "     (first-time activation of the mounted config: nasctl stack webserver recreate)"
  fi
else
  echo "⚠️  nginx config sync failed; site deploy still succeeded."
fi

echo "✅ Deploy complete."
