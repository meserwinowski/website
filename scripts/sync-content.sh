#!/bin/bash
# sync-content.sh — Pulls markdown content from the Obsidian vault into the website source.
# Run before `npm run build` or `npm run deploy` to pick up vault edits.
set -e

# Load local configuration (git-ignored; see deploy.env.example).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$REPO_ROOT/deploy.env" ] && { set -a; . "$REPO_ROOT/deploy.env"; set +a; }

# Source: Obsidian vault content folder (VAULT_SUBPATH is relative to $HOME).
VAULT_DIR="${VAULT_DIR:-$HOME/${VAULT_SUBPATH:?set VAULT_SUBPATH in deploy.env}}"
export VAULT_DIR

# Destinations
PROJECTS_DIR="./src/content/projects"
PAGES_DIR="./src/content/pages"
IMAGES_DIR="./public/images"

# Colors
DIM="\033[2m"
BLUE="\033[34m"
GREEN="\033[32m"
YELLOW="\033[33m"
RESET="\033[0m"

# Ensure destination directories exist
mkdir -p "$PROJECTS_DIR" "$PAGES_DIR" "$IMAGES_DIR"

echo ""
echo -e "  ${BLUE}◆${RESET}  Syncing content from Obsidian vault"
echo -e "  ${DIM}   $VAULT_DIR${RESET}"
echo ""

# Sync projects
if [ -d "$VAULT_DIR/projects" ]; then
  OUTPUT=$(rsync -a --delete --include='*.md' --exclude='*' --stats "$VAULT_DIR/projects/" "$PROJECTS_DIR/" 2>&1)
  COUNT=$(find "$PROJECTS_DIR" -name '*.md' | wc -l | tr -d ' ')
  echo -e "  ${GREEN}✓${RESET}  Projects   ${DIM}${COUNT} files${RESET}"
else
  echo -e "  ${YELLOW}⚠${RESET}  Projects   ${DIM}no vault folder found${RESET}"
fi

# Sync pages
if [ -d "$VAULT_DIR/pages" ]; then
  OUTPUT=$(rsync -a --delete --include='*.md' --exclude='*' --stats "$VAULT_DIR/pages/" "$PAGES_DIR/" 2>&1)
  COUNT=$(find "$PAGES_DIR" -name '*.md' | wc -l | tr -d ' ')
  echo -e "  ${GREEN}✓${RESET}  Pages      ${DIM}${COUNT} files${RESET}"
else
  echo -e "  ${YELLOW}⚠${RESET}  Pages      ${DIM}no vault folder found${RESET}"
fi

# Sync images
if [ -d "$VAULT_DIR/images" ]; then
  rsync -a "$VAULT_DIR/images/" "$IMAGES_DIR/"
  COUNT=$(find "$IMAGES_DIR" -type f ! -name '.embed-manifest.json' | wc -l | tr -d ' ')
  echo -e "  ${GREEN}✓${RESET}  Images     ${DIM}${COUNT} files${RESET}"
else
  echo -e "  ${YELLOW}⚠${RESET}  Images     ${DIM}no vault folder found${RESET}"
fi

node ./scripts/sync-obsidian-assets.mjs
node ./scripts/strip-image-metadata.mjs

# Normalize Obsidian-flavored markdown for CommonMark: Obsidian indents nested
# list items with tabs, but a leading tab is an indented code block in
# CommonMark — so tab-indented lists render as <pre> blocks. Convert each
# leading tab to 2 spaces (one list level), skipping fenced code so real code
# is left untouched. Idempotent.
find "$PROJECTS_DIR" "$PAGES_DIR" -name '*.md' -print0 | while IFS= read -r -d '' f; do
  perl -i -pe 'BEGIN { $fence = 0 } if (/^\s*```/) { $fence = !$fence } unless ($fence) { 1 while s/^(\x20*)\t/$1  /g }' "$f"
done
echo -e "  ${GREEN}✓${RESET}  Normalized ${DIM}tab-indented lists${RESET}"

echo ""
echo -e "  ${GREEN}Done${RESET}"
echo ""
