---
name: sync-vault-content
description: Use when the user wants to pull their latest Obsidian vault edits into the website (without deploying) — e.g. "sync my content", "pull the latest from the vault", "did my Obsidian edits come through?". Runs the content sync and previews what changed so they can review before building or deploying.
---

# Sync Vault Content

Pull the latest Markdown content from the Obsidian vault into the site source, then show what changed. This is the lightweight alternative to a full deploy — use it mid-edit to preview vault changes locally.

## Steps

1. Run the sync:
   ```bash
   npm run sync
   ```
   Source: Obsidian (`VAULT_SUBPATH` in `deploy.env`) → private `CONTENT_REPO_DIR`
   (default `../website-content`) → ignored production content/assets.
2. Report what landed. Review the private checkout's diff, not the public
   repository's ignored `src/content/`. Never stage authored content in public Git.
   ```bash
   ls -lt src/content/projects src/content/pages
   ```
3. If the user wants to see the rendered result, offer to start the dev server:
   ```bash
   npm run dev
   ```
   (Astro dev server with live reload — leave it running in the background and share the local URL.)

## Notes

- This does **not** build or deploy. When the user is happy with the preview, hand off to the `deploy-website` skill to ship it.
- New project files need valid frontmatter (`title`, `description`, `status`, `tags`, `date`, optional `thumbnail`/`repo`). Only `completed` and `ongoing` projects render on main routes; `archived` entries render in the public unlisted archive. Draft-only assets are not assembled for production.
- Sync does not commit or push. Hosted deployment requires reviewing, committing,
  and pushing the private export. Public code-only releases use private workflow dispatch.
- If sync reports "no vault folder found", the vault path (`VAULT_SUBPATH` in `deploy.env`) is wrong or the vault moved — verify it points at the current vault location.
