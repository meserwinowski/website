#!/bin/bash
set -e

NAS_USER="youruser"
NAS_HOST="your-nas-host"
DEPLOY_TARGET="/path/to/webserver/dist"
SOURCE_DIR="./dist/"

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

echo "✅ Deploy complete."
