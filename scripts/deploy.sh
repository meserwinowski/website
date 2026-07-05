#!/bin/bash
#
# deploy.sh — Publish the static site to the Synology NAS.
#
# High-level flow:
#  1. Load local deploy settings.
#  2. Sync the latest Obsidian content into the repo.
#  3. Build Astro into dist/.
#  4. Mirror dist/ to the NAS over SSH.
#  5. Push nginx/default.conf and ask nginx to reload it.
#
# NAS_HOST is expected to be reachable on the private Tailscale tailnet (for
# example, the mainecoon machine name), so deploys do not require a public SSH
# port on the NAS.

# Stop as soon as a command exits non-zero. Any pre-deploy gate placed before
# the rsync step — sync, build, or tests — blocks a bad deploy by exiting here.
set -e

# Resolve the repository root from this script's location, then load the
# git-ignored deploy.env file from there.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/deploy.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Missing deploy.env. Copy deploy.env.example to deploy.env and fill in your values." >&2
  exit 1
fi

# `set -a` auto-exports every sourced assignment, which makes deploy settings
# available to child processes such as sync-content.sh, rsync, and ssh.
set -a; . "$ENV_FILE"; set +a

# The `:?` checks fail early with a clear message if required deploy settings
# are missing, instead of building and then failing during the remote copy.
NAS_USER="${NAS_USER:?set NAS_USER in deploy.env}"
NAS_HOST="${NAS_HOST:?set NAS_HOST in deploy.env}"
DEPLOY_TARGET="${DEPLOY_TARGET:?set DEPLOY_TARGET in deploy.env}"
NGINX_DIR="${NGINX_DIR:?set NGINX_DIR in deploy.env}"
SOURCE_DIR="./dist/"

# Shared SSH options: do not run any forced RemoteCommand and do not request a
# TTY, because these calls execute one command non-interactively and exit.
SSH_OPTS="-o RemoteCommand=none -o RequestTTY=no"

# Container lifecycle is owned by a separate NAS toolkit (nasctl) kept outside
# this repo. We only need it here to reload nginx after pushing a new config.
NASCTL="$(command -v nasctl || true)"
: "${NASCTL:=${NASCTL_PATH:-}}"

# Phase 1: sync content from the Obsidian vault before building, so dist/
# includes the latest committed/generated markdown and assets.
echo "📥 Syncing content from vault..."
./scripts/sync-content.sh

# Phase 2: build the static Astro site into dist/. With `set -e`, a build
# failure stops here before any files on the NAS are touched.
echo "🔨 Building site..."
npm run build

# Phase 3: deploy via rsync over SSH on the Tailscale tailnet. rsync compares
# local dist/ with the remote target and transfers only differences.
echo "🚀 Deploying to $NAS_HOST:$DEPLOY_TARGET ..."

# rsync flags:
#   -a preserves the built directory tree ("archive" mode).
#   -v prints changed files, useful during a manual deploy.
#   -z compresses data in transit.
#   --delete removes remote files no longer present in dist/.
#   --exclude skips macOS Finder metadata that should never be served.
# `-e` tells rsync which SSH command/options to use for the remote connection.
rsync -avz --delete \
  --exclude='.DS_Store' \
  -e "ssh -o RemoteCommand=none -o RequestTTY=no" \
  "$SOURCE_DIR" "$NAS_USER@$NAS_HOST:$DEPLOY_TARGET/"

# Sync nginx config (AI/scraper blocking + rate limiting), then ask nginx to
# reload it via the generic NAS toolkit. The container itself (compose.yaml) is
# managed by nasctl; here we only push the config file + reload. Best-effort —
# failures never fail the site deploy.
echo "🛡️  Syncing nginx config..."
# This ssh command runs `mkdir -p` on the NAS, not locally. The following rsync
# copies just nginx/default.conf; the `&&` keeps reload attempts behind a
# successful remote directory creation and config upload.
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
