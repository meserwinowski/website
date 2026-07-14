#!/bin/bash
#
# sync-content.sh — Mirror Obsidian-authored content into the Astro project.
#
# The vault is the source of truth. This script copies markdown into
# src/content/ and publishes only referenced image assets into public/assets/.
# Because the folder syncs use rsync --delete, destination folders are made to
# match the vault exactly — hand-edits in generated content are wiped next sync.
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

# Generated destinations inside the website. Markdown comes from the vault;
# images are written by the asset pipeline below.
PROJECTS_DIR="./src/content/projects"
PAGES_DIR="./src/content/pages"
IMAGES_DIR="./public/assets"

# Terminal colors for compact, readable progress output.
DIM="\033[2m"
BLUE="\033[34m"
GREEN="\033[32m"
YELLOW="\033[33m"
RESET="\033[0m"

# Create destinations before rsync/node steps; `-p` is idempotent.
mkdir -p "$PROJECTS_DIR" "$PAGES_DIR" "$IMAGES_DIR"

echo ""
echo -e "  ${BLUE}◆${RESET}  Syncing content from Obsidian vault"
echo -e "  ${DIM}   $VAULT_DIR${RESET}"
echo ""

# Sync project markdown. The trailing slashes mean "copy the contents of this
# folder into the destination folder" rather than nesting another projects/.
if [ -d "$VAULT_DIR/projects" ]; then
  # rsync flags:
  #   -a preserves the directory tree and file metadata ("archive" mode).
  #   --delete removes destination files no longer present in the vault.
  #   --include/--exclude together copy only *.md files.
  # Output is captured so the normal log stays learner-friendly.
  OUTPUT=$(rsync -a --delete --include='*.md' --exclude='*' --stats "$VAULT_DIR/projects/" "$PROJECTS_DIR/" 2>&1)
  COUNT=$(find "$PROJECTS_DIR" -name '*.md' | wc -l | tr -d ' ')
  echo -e "  ${GREEN}✓${RESET}  Projects   ${DIM}${COUNT} files${RESET}"
else
  echo -e "  ${YELLOW}⚠${RESET}  Projects   ${DIM}no vault folder found${RESET}"
fi

# Sync standalone page markdown using the same mirror pattern as projects.
if [ -d "$VAULT_DIR/pages" ]; then
  OUTPUT=$(rsync -a --delete --include='*.md' --exclude='*' --stats "$VAULT_DIR/pages/" "$PAGES_DIR/" 2>&1)
  COUNT=$(find "$PAGES_DIR" -name '*.md' | wc -l | tr -d ' ')
  echo -e "  ${GREEN}✓${RESET}  Pages      ${DIM}${COUNT} files${RESET}"
else
  echo -e "  ${YELLOW}⚠${RESET}  Pages      ${DIM}no vault folder found${RESET}"
fi

# Embedded images and Excalidraw exports are published per-project by
# sync-obsidian-assets.mjs (assets referenced via ![[...]] embeds are copied and
# grouped under public/assets/<slug>/; frontmatter thumbnails like
# /assets/cover.png are also pulled from the vault to their authored path).
# HEIC/HEIF embeds are then converted to WebP and oversized photos are downscaled
# by strip-image-metadata.mjs. We intentionally don't mirror the whole vault
# images/ folder, so unreferenced assets stay out of public/.
# These Node scripts inherit VAULT_DIR from the exported shell environment above.
node ./scripts/sync-obsidian-assets.mjs
node ./scripts/strip-image-metadata.mjs

# Normalize Obsidian-flavored markdown for CommonMark: Obsidian indents nested
# list items with tabs, but a leading tab is an indented code block in
# CommonMark — so tab-indented lists render as <pre> blocks. Convert each
# leading tab to 2 spaces (one list level), skipping fenced code so real code
# is left untouched. Idempotent.
# `-print0` plus `read -d ''` keeps filenames with spaces safe. The Perl
# one-liner flips a fence flag on ``` lines, then rewrites only leading tabs
# outside those fences.
find "$PROJECTS_DIR" "$PAGES_DIR" -name '*.md' -print0 | while IFS= read -r -d '' f; do
  perl -i -pe 'BEGIN { $fence = 0 } if (/^\s*```/) { $fence = !$fence } unless ($fence) { 1 while s/^(\x20*)\t/$1  /g }' "$f"
done
echo -e "  ${GREEN}✓${RESET}  Normalized ${DIM}tab-indented lists${RESET}"

echo ""
echo -e "  ${GREEN}Done${RESET}"
echo ""
