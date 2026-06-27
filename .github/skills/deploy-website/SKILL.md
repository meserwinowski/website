---
name: deploy-website
description: Use when the user wants to deploy, ship, publish, or push the personal website live. Runs the full safe pipeline — sync vault content, build, run the Vitest gate, then rsync the built site to the Synology NAS over SSH. Includes pre-flight checks and confirmation before the destructive rsync --delete.
---

# Deploy Website

Ship the Astro site to production (nginx in Docker on the Synology NAS). The deploy target — SSH user, host, and paths — is read from the git-ignored `deploy.env` (`NAS_USER`, `NAS_HOST`, `DEPLOY_TARGET`); see `deploy.env.example`. Run every step from the repo root.

## Pre-flight

1. Confirm the working tree is in a known state: `git status -s`. If there are unexpected uncommitted source changes, surface them and ask whether to proceed.
2. Verify the NAS is reachable before doing any work:
   ```bash
   set -a; . ./deploy.env; set +a
   ssh -o ConnectTimeout=5 -o RemoteCommand=none -o RequestTTY=no "$NAS_HOST" true
   ```
   If this fails, stop and tell the user — likely the network/VPN is down or the SSH key (`~/.ssh`) isn't loaded. Do not continue.

## Pipeline

3. **Sync content** from the Obsidian vault:
   ```bash
   npm run sync
   ```
   Report which `projects/` and `pages/` files were pulled. The source vault is configured via `VAULT_SUBPATH` in `deploy.env` (consumed by `scripts/sync-content.sh`).
4. **Gate on tests** — this builds the site and runs Vitest against the built `dist/`:
   ```bash
   npm test
   ```
   If the build or any test fails, **STOP**. Show the failure and fix it (or report it) before deploying. Never deploy a red build.
5. **Deploy** only after the gate is green:
   ```bash
   npm run deploy
   ```
   This re-runs sync + build, then `rsync -avz --delete` of `dist/` to the target configured in `deploy.env` (`NAS_HOST:DEPLOY_TARGET`).
   - The `--delete` flag removes remote files not present locally. This is expected, but if anything in the pre-flight looked off, confirm with the user before this step.

## Post-deploy

6. Optionally verify the live site responds (ask the user for the URL if unknown), e.g. `curl -sI https://<site> | head -1`.
7. Per repo convention, check whether `README.md` or `TODO.md` need updating after the change, and remind the user to commit source changes — synced content under `src/content/` is committed so CI can build without the vault.

## Notes

- The nginx container's `compose.yaml` is managed by a separate `nasctl` toolkit kept outside this repo. This repo only ships `dist/` + `nginx/default.conf`; `deploy.sh` reloads nginx via `nasctl`. Never run Docker/compose here.
- Tailwind is wired through `@tailwindcss/vite` (v4). Do not add `@astrojs/tailwind`.
