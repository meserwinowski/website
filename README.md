# Matt Serwinowski - Personal Website

[![Deploy](https://github.com/meserwinowski/website/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/meserwinowski/website/actions/workflows/deploy.yml)

A personal portfolio and posts site built with [Astro](https://astro.build/) and [Tailwind CSS v4](https://tailwindcss.com/), served via nginx on a Synology NAS.

## Build & Deployment

### Prerequisites

- Node.js (with npm)
- SSH access to the NAS (`your-nas-host` via Tailscale)

### Development

```bash
npm install    # Install dependencies
npm run dev    # Start local dev server
```

### Build

```bash
npm run build  # Generates static site in dist/
```

### Deploy

```bash
npm run deploy  # Syncs content, builds, and deploys to the NAS
```

This runs `deploy.sh`, which:
1. Syncs content from the Obsidian vault (`sync-content.sh`)
2. Builds the site with `astro build`
3. Rsyncs the `dist/` directory to `/path/to/webserver/dist` on the NAS
4. nginx (running in Docker) serves the files automatically

### Continuous Deployment (CI/CD)

Every push to `main` triggers the [`deploy.yml`](.github/workflows/deploy.yml) GitHub Actions
workflow, which builds the site, runs the test suite as a gate, joins the tailnet via
[Tailscale](https://github.com/tailscale/github-action), and rsyncs `dist/` to the NAS — the
same steps as `npm run deploy`, run on a hosted runner. You can also trigger it manually from
the Actions tab (`workflow_dispatch`), and you can still deploy locally any time with
`npm run deploy`.

Because GitHub's hosted runners can't reach the Obsidian vault, **site content is committed to
the repo** (`src/content/`). Run `npm run sync` and commit before pushing so CI builds your
latest content.

**Required GitHub Secrets:**

| Secret | Purpose |
|--------|---------|
| `NAS_SSH_KEY` | Passphrase-less private deploy key (`nas_deploy_key`) |
| `NAS_HOST` | NAS hostname (`your-nas-host` via Tailscale MagicDNS) |
| `NAS_USER` | SSH username on the NAS |
| `NAS_DEPLOY_PATH` | Deploy target (`/path/to/webserver/dist`) |
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID (scoped to `tag:ci`) |
| `TS_OAUTH_SECRET` | Tailscale OAuth client secret |

**Hardened deploy key:** on the NAS, the deploy key is locked down in `~/.ssh/authorized_keys`
with a forced command + `restrict`:

```
command="/var/services/homes/youruser/bin/deploy-rsync-only.sh",restrict ssh-ed25519 AAAA... github-actions-deploy
```

The wrapper (`~/bin/deploy-rsync-only.sh`) permits **only** an `rsync` push and forces the
destination to `/path/to/webserver/dist/` — no shell, no other paths, no downloads. If a
leaked key is the worst case, it can do exactly one thing: rsync into `dist`. The personal key
stays unrestricted for admin/recovery. If you ever change the rsync flags in `deploy.yml`
(e.g. add `--rsync-path`), re-test the deploy, since the wrapper only passes through standard
`rsync --server` invocations.

### Content Sync

```bash
npm run sync   # Pull latest content from Obsidian vault
```

Content lives in your Obsidian vault at `~/obsidian/vault/Projects/Website/`:

| Vault folder | Destination | Purpose |
|--------------|-------------|---------|
| `projects/` | `src/content/projects/` | Project markdown files (with frontmatter) |
| `pages/` | `src/content/pages/` | Page content (home, about) |

Edit markdown in Obsidian → run `npm run deploy` to ship directly, **or** `npm run sync`,
commit, and push to deploy via CI.

## Crawlers, AI Bots, and Security Metadata

Two layers handle web crawlers and AI scrapers:

1. **`public/robots.txt`** (the polite request) — copied verbatim to `dist/robots.txt`
   on build. Allows normal search engines (Googlebot, Bingbot, etc.) and points them at
   the sitemap, while disallowing AI training/scraping crawlers (`GPTBot`, `ClaudeBot`,
   `Google-Extended`, `CCBot`, `PerplexityBot`, `Bytespider`, …). `robots.txt` is
   voluntary — well-behaved bots honor it; bad actors ignore it.

2. **`nginx/default.conf`** (the enforcement) — mounted into the nginx container at
   `/etc/nginx/conf.d/default.conf`. Returns `403` for AI/scraper User-Agents that ignore
   `robots.txt` and rate-limits aggressive clients (10 req/s per IP, burst 20 → `429`).

`scripts/deploy.sh` rsyncs `nginx/default.conf` to the NAS and asks nginx to
`nginx -t && nginx -s reload` via the [`nasctl`](#nas-container-management) toolkit on every
deploy (best-effort; it never fails the site deploy).

**One-time activation** (the bind mount must exist before a reload can pick up the file). The
`webserver` stack's `compose.yaml` (which carries the `nginx/default.conf` mount) lives in the
`nasctl` toolkit, not in this repo. After the first deploy has placed the config on the NAS,
recreate the container once so the mount takes effect:

```bash
nasctl stack webserver recreate
```

After that, routine deploys reload nginx in place — no recreate needed.

If scraping ever gets bad despite this, put Cloudflare (free tier) in front and enable
its "Block AI Scrapers and Crawlers" managed rule to catch User-Agent spoofers.

`public/.well-known/security.txt` is copied verbatim to
`dist/.well-known/security.txt` on build. This gives scanners and security
researchers a standard contact record for the site, including the canonical URL
that Cloudflare and other checks expect.

## NAS container management

The nginx container (and every other Docker stack on the NAS) is managed by a separate,
generic toolkit — **`nasctl`** — that lives outside this repo (in OneDrive, the source of
truth) and isn't site-specific. It rsyncs compose files + a dispatcher to the NAS and runs
Docker lifecycle commands over SSH, so there's no manual SSHing or DSM Container Manager
fiddling. The `webserver` stack's `compose.yaml` (with the `nginx/default.conf` bind mount)
lives there, not here.

Common commands:

```bash
nasctl ls                            # list stacks + running containers
nasctl stack webserver ps            # status of the website stack
nasctl stack webserver recreate      # rebuild the container (e.g. after a compose/mount change)
nasctl ctl webserver_nginx exec nginx -s reload   # hot-reload nginx config
```

`scripts/deploy.sh` uses `nasctl` automatically to reload nginx after pushing
`nginx/default.conf`. Run `nasctl bootstrap` once to set up passwordless operation.

## Testing

```bash
npm test                                     # Build + run all tests
npx vitest run tests/html-structure.test.ts  # Run a single test file
```

Tests run against the built `dist/` output (static HTML files) using [Vitest](https://vitest.dev/). This makes `npm test` a reliable gate before deploying — if the build breaks or the HTML structure regresses, tests fail.

| Test file | What it checks |
|-----------|----------------|
| `tests/build.test.ts` | `astro build` exits successfully, all page HTML files exist, 404 + sitemap + robots.txt + security.txt generated |
| `tests/html-structure.test.ts` | Key HTML elements: titles, meta tags, OG tags, navigation, headings, footer, project cards, detail content |

## Features

- **Dark/light theme** — toggle with localStorage persistence, no flash on load
- **Projects portfolio** — Astro Content Collections with Markdown, status badges, tags
- **View Transitions** — directional slide animations between pages (no full reload)
- **Spring easing** — subtle scale animations on hover/active for buttons and links
- **Responsive design** — mobile hamburger menu, responsive grid layouts
- **Obsidian vault sync** — edit content in Obsidian, sync to site at deploy time
- **CI/CD** — push to `main` auto-builds, tests, and deploys to the NAS via GitHub Actions + Tailscale
- **SEO** — Open Graph, Twitter cards, canonical URLs, auto-generated sitemap
- **Crawler & AI control** — `robots.txt` opt-out plus nginx User-Agent blocking + rate limiting
- **404 page** — custom styled error page

## Design System

Defined in `src/styles/global.css` using Tailwind v4's `@theme` directive:

- **Colors:** Dark/light themes with custom properties (`--color-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-muted`, `--color-accent`)
- **Fonts:** Inter (body) + JetBrains Mono (header/code) via Google Fonts
- **Layout:** Per-content widths via a shared `--container` var on `<body>`. Reading pages use `--width-prose` (45rem / 720px — the readable measure); structural/grid pages opt into `--width-wide` (72rem / 1152px ≈ prose × φ) by passing `width="wide"` to `Base.astro`. Containers stay fluid below the cap, and `.prose` is capped at the measure so body text never stretches inside a wide shell.
- **Animations:** Spring easing (`cubic-bezier(0.34, 1.56, 0.64, 1)`) on interactive elements

## Adding Projects

Create a Markdown file in `src/content/projects/` with this frontmatter:

```yaml
---
title: "Project Name"
description: "Short one-liner for the card"
status: "done"       # done | ongoing | planning | idea
tags: ["software", "hardware"]
thumbnail: "/images/projects/project-name.svg"
date: 2026-06-01
repo: "https://github.com/..."  # optional
---

Your markdown content here...
```

Only `done` and `ongoing` projects are shown publicly. Place thumbnail images in `public/images/projects/`.

## Project Structure

| Path | Purpose |
|------|---------|
| `src/pages/` | Astro page routes — Home, Projects, Posts, About, 404 |
| `src/pages/projects/[slug].astro` | Dynamic project detail pages |
| `src/layouts/` | Base page layout (header + content + footer + view transitions) |
| `src/components/` | UI components (Header, Footer, ProjectCard, ThemeToggle, SocialLinks) |
| `src/styles/` | CSS files: `global.css` (theme), `prose.css` (markdown typography), `transitions.css` (page animations) |
| `src/content.config.ts` | Content collection schema definition (projects + pages) |
| `src/content/projects/` | Project Markdown files (synced from Obsidian, committed so CI can build) |
| `src/content/pages/` | Page content files (synced from Obsidian, committed so CI can build) |
| `public/` | Static assets served as-is, including images, favicon, robots.txt, and `.well-known/security.txt` |
| `.github/workflows/deploy.yml` | CI/CD pipeline — build, test, and deploy to the NAS on push |
| `tests/` | Vitest test files (43 tests: build verification + HTML assertions) |
| `astro.config.mjs` | Astro framework configuration (Vite + Tailwind plugin + sitemap) |
| `tsconfig.json` | TypeScript configuration |
| `package.json` | Dependencies and npm scripts |
| `nginx/default.conf` | nginx config (AI/scraper UA blocking + rate limiting); rsynced to the NAS by `deploy.sh` |
| `scripts/sync-content.sh` | Pulls markdown content from Obsidian vault |
| `scripts/deploy.sh` | Sync + build + rsync deployment script |
| `dist/` | Build output (gitignored) |
| `.astro/` | Generated types and cache (gitignored) |
