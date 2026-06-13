#!/bin/bash
# sync-content.sh — Pulls markdown content from the Obsidian vault into the website source.
# Run before `npm run build` or `npm run deploy` to pick up vault edits.
set -e

# Source: Obsidian vault content folder
VAULT_DIR="$HOME/Library/CloudStorage/OneDrive-Personal/obsidian/vault/Projects/Website"

# Destinations
PROJECTS_DIR="./src/content/projects"
PAGES_DIR="./src/content/pages"

# Colors
DIM="\033[2m"
BLUE="\033[34m"
GREEN="\033[32m"
YELLOW="\033[33m"
RESET="\033[0m"

# Ensure destination directories exist
mkdir -p "$PROJECTS_DIR" "$PAGES_DIR"

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

echo ""
echo -e "  ${GREEN}Done${RESET}"
echo ""
