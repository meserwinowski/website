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
   ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 \
     -o RemoteCommand=none -o RequestTTY=no "$NAS_USER@$NAS_HOST" \
     'sudo -n rsync --version >/dev/null && sudo -n test -x /volume1/docker_commands/nas-docker.sh'
   ```
   If this fails, stop and tell the user — likely the network/VPN is down or the SSH key (`~/.ssh`) isn't loaded. Do not continue.

## Pipeline

3. **Deploy** after reviewing the target and confirming any uncertain `--delete` scope:
   ```bash
   npm run deploy
   ```
   Both local scripts preflight noninteractive access, export vault content to the private
   checkout, assemble ignored production inputs, refuse demo inputs, and run `npm test`
   (build + Vitest), upload to a private temporary directory as `NAS_USER`, then use
   local `sudo -n rsync --delete` on the NAS to mirror `dist/` to `DEPLOY_TARGET`.
   Target ownership is preserved and staging is cleaned up after success or failure.
   Build/test failures stop before publishing. Do not use root rsync server mode:
   DSM rejects it because the root account is disabled.
   Do not separately sync/build/test first unless diagnosing a failure.
   Report which `projects/` and `pages/` files were pulled. The vault is configured via
   `VAULT_SUBPATH` in `deploy.env`.
   - The `--delete` flag removes remote files not present locally. This is expected, but if anything in the pre-flight looked off, confirm with the user before this step.

## Post-deploy

4. Verify the live site responds (ask the user for the URL if unknown), e.g. `curl -sS -L --fail --max-time 20 -o /dev/null -w '%{http_code}\n' https://<site>`. Inspect any nginx warnings: config/reload remains best-effort even when the site files published successfully.
5. Check whether README or TODO need updating. Commit code only in the public
   repository; authored inputs belong in the private publishing repository.
   Hosted Actions run privately on content pushes or explicit code-release dispatch.

## Notes

- Local deployment uses `NAS_USER=copilot` and `sudo -n`; it never installs keys or changes sudoers. SSH retains strict host-key verification.
- This repo ships only `dist/` + `nginx/default.conf`; both scripts validate/reload nginx through the installed `/volume1/docker_commands/nas-docker.sh` over SSH, never the syncing local `nasctl` launcher. Config transfer uses `--inplace` to preserve the bind-mounted file's inode.
- The `webserver` container is DSM-owned. Image upgrades, recreation and mount changes must go through Synology Container Manager; do not run Docker/Compose recreation here.
- Tailwind is wired through `@tailwindcss/vite` (v4). Do not add `@astrojs/tailwind`.
