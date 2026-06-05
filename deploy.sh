#!/bin/bash
set -e

NAS_TAILSCALE_IP="100.95.83.97"
SMB_SHARE="docker"
MOUNT_POINT="/Volumes/docker"
DEPLOY_TARGET="$MOUNT_POINT/webserver"
SOURCE_DIR="./public/"

# Check if NAS share is mounted, try to mount via Tailscale if not
if [ ! -d "$DEPLOY_TARGET" ]; then
  echo "📡 NAS not mounted. Mounting via Tailscale..."

  # Create mount point if needed
  [ -d "$MOUNT_POINT" ] || sudo mkdir -p "$MOUNT_POINT"

  # Mount SMB share (uses stored keychain credentials)
  mount_smbfs "//$NAS_TAILSCALE_IP/$SMB_SHARE" "$MOUNT_POINT" 2>/dev/null || {
    echo "❌ Could not mount. Try manually:"
    echo "   open smb://$NAS_TAILSCALE_IP/$SMB_SHARE"
    echo "   Then re-run this script."
    exit 1
  }

  echo "✅ Mounted $SMB_SHARE"
fi

echo "🚀 Deploying to $DEPLOY_TARGET ..."

rsync -av --delete \
  --exclude='.DS_Store' \
  "$SOURCE_DIR" "$DEPLOY_TARGET/"

echo "✅ Deploy complete."
