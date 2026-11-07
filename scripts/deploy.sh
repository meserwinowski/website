#!/bin/bash
#
# deploy.sh — Publish the static site to the Synology NAS.
#
# High-level flow:
#  1. Load local deploy settings.
#  2. Sync the latest Obsidian content into the repo.
#  3. Build Astro into dist/ and run the test gate.
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
cd "$REPO_ROOT"
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

for path in "$DEPLOY_TARGET" "$NGINX_DIR"; do
  if [[ ! "$path" =~ ^/[A-Za-z0-9_./-]+$ || "$path" =~ ^/+$ || "$path" =~ (^|/)\.\.?(/|$) ]]; then
    echo "Invalid deploy path: use a non-root absolute path without spaces or dot segments." >&2
    exit 1
  fi
done

SSH_OPTS=(-o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 -o RemoteCommand=none -o RequestTTY=no)
RSYNC_SSH="ssh ${SSH_OPTS[*]}"
REMOTE="$NAS_USER@$NAS_HOST"
DISPATCHER="/volume1/docker_commands/nas-docker.sh"

for tool in rsync ssh npm; do
  command -v "$tool" >/dev/null || { echo "$tool is required on PATH." >&2; exit 1; }
done

echo "Checking noninteractive NAS access..."
ssh "${SSH_OPTS[@]}" "$REMOTE" \
  "sudo -n rsync --version >/dev/null && sudo -n test -x '$DISPATCHER'"

# Phase 1: sync content from the Obsidian vault before building, so dist/
# includes the latest committed/generated markdown and assets.
echo "📥 Syncing content from vault..."
./scripts/sync-content.sh
npm run verify:production

# npm test builds dist/ first; either a build or test failure blocks publishing.
echo "🔨 Building and testing site..."
npm test

# DSM rejects root rsync server sessions. Upload as copilot, then use sudo only
# for a local copy on the NAS, preserving the destination owner's UID/GID.
# Synology's inherited ACLs can override mktemp/umask permissions.
STAGING_DIR=$(ssh "${SSH_OPTS[@]}" "$REMOTE" 'stage=$(umask 077; mktemp -d "$HOME/website-deploy.XXXXXXXX") && chmod 0700 "$stage" && test "$(stat -c %a "$stage")" = 700 && printf "%s\n" "$stage"')
if [[ ! "$STAGING_DIR" =~ ^/[A-Za-z0-9_./-]+/website-deploy\.[A-Za-z0-9]{8}$ || "$STAGING_DIR" =~ (^|/)\.\.?(/|$) ]]; then
  echo "NAS returned an invalid staging directory; refusing transfer or cleanup." >&2
  exit 1
fi
cleanup() {
  ssh "${SSH_OPTS[@]}" "$REMOTE" "rm -rf -- '$STAGING_DIR'" \
    || echo "Warning: could not remove temporary staging directory $STAGING_DIR." >&2
}
trap cleanup EXIT

echo "🚀 Deploying to $NAS_HOST:$DEPLOY_TARGET ..."

rsync -avz \
  --exclude='.DS_Store' \
  -e "$RSYNC_SSH" \
  "$SOURCE_DIR" "$REMOTE:$STAGING_DIR/dist/"
ssh "${SSH_OPTS[@]}" "$REMOTE" \
  "owner=\$(sudo -n stat -c '%u:%g' '$DEPLOY_TARGET') && sudo -n rsync -a --delete --exclude='.DS_Store' --chown=\"\$owner\" -- '$STAGING_DIR/dist/' '$DEPLOY_TARGET/'"

# Use the installed dispatcher, not the local nasctl launcher (which syncs
# unrelated maintenance files). Container replacement remains DSM-owned.
# Config updates remain best-effort after the site files have been deployed.
echo "🛡️  Syncing nginx config..."
# --inplace preserves the inode of the single-file nginx bind mount.
if rsync -avz -e "$RSYNC_SSH" ./nginx/default.conf "$REMOTE:$STAGING_DIR/default.conf" \
  && ssh "${SSH_OPTS[@]}" "$REMOTE" \
    "sudo -n mkdir -p '$NGINX_DIR' && owner=\$(sudo -n stat -c '%u:%g' '$NGINX_DIR') && sudo -n rsync -a --inplace --chown=\"\$owner\" -- '$STAGING_DIR/default.conf' '$NGINX_DIR/default.conf'"; then
  if ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo -n $DISPATCHER ctl webserver_nginx exec nginx -t" \
    && ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo -n $DISPATCHER ctl webserver_nginx exec nginx -s reload"; then
    echo "✅ nginx config reloaded."
  else
    echo "⚠️  nginx validation/reload failed; site files were deployed. Check the config and DSM-managed mounts."
  fi
else
  echo "⚠️  nginx config sync failed; site deploy still succeeded."
fi

echo "✅ Deploy complete."
