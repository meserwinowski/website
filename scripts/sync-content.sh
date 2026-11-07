#!/bin/bash
#
# sync-content.sh — Export Obsidian content privately, then assemble Astro inputs.
#
# The vault is the source of truth. A shared Node pipeline prepares the private
# publishing export and replaces only its owned generated build destinations.
# Neither the private export nor the ignored build inputs should be hand-edited.
#
# Run before `npm run build` or `npm run deploy` to pick up vault edits.

# Stop as soon as a command exits non-zero. That prevents a partial sync from
# being reported as "Done" and keeps later steps from running on bad inputs.
set -e

# Resolve the repository root from this script's location, so the script works
# no matter which directory the user ran it from.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load local configuration (git-ignored; see deploy.env.example). `set -a`
# temporarily auto-exports sourced variables so child Node scripts can read
# values like VAULT_DIR/EXCALIDRAW_SUBPATH from the environment.
[ -f "$REPO_ROOT/deploy.env" ] && { set -a; . "$REPO_ROOT/deploy.env"; set +a; }

# Source: Obsidian vault content folder. VAULT_SUBPATH is relative to $HOME;
# the `${VAR:?message}` form fails early with a clear message when it is unset.
VAULT_DIR="${VAULT_DIR:-$HOME/${VAULT_SUBPATH:?set VAULT_SUBPATH in deploy.env}}"
export VAULT_DIR

cd "$REPO_ROOT"
exec node ./scripts/content-pipeline.mjs sync
