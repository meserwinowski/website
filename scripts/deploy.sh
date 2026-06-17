#!/bin/bash
set -e

NAS_USER="youruser"
NAS_HOST="your-nas-host"
DEPLOY_TARGET="/path/to/webserver/dist"
NGINX_DIR="/path/to/webserver/nginx"
SOURCE_DIR="./dist/"
SSH_OPTS="-o RemoteCommand=none -o RequestTTY=no"

# Container lifecycle is owned by the generic NAS toolkit (nasctl), which lives in
# OneDrive. We only need it here to reload nginx after pushing a new config.
NASCTL="$(command -v nasctl || true)"
: "${NASCTL:=$HOME/Library/CloudStorage/path/to/nasctl}"

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
