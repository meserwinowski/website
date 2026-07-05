# Matt Serwinowski - Personal Website

[![Deploy](https://github.com/meserwinowski/website/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/meserwinowski/website/actions/workflows/deploy.yml)

A personal portfolio and posts site built with [Astro](https://astro.build/) and [Tailwind CSS v4](https://tailwindcss.com/), served via nginx on a Synology NAS.

## Build & Deployment

### Prerequisites

- Node.js (with npm)
- Windows PowerShell 5.1+ on Windows, or Bash on macOS/Linux, for local helper scripts
- SSH access to the NAS (host configured in `deploy.env`) for local deploys
- `rsync` and `ssh` on `PATH` for local deploys

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

This runs `scripts/run-local-script.mjs`, which dispatches to PowerShell on
Windows (`deploy.ps1`) or Bash on macOS/Linux (`deploy.sh`). The deploy script:
1. Syncs content from the Obsidian vault (`sync-content.ps1` / `sync-content.sh`)
2. Builds the site with `astro build`
3. Rsyncs the `dist/` directory to the NAS deploy target (`DEPLOY_TARGET` in `deploy.env`)
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
| `NAS_HOST` | NAS hostname (e.g. a Tailscale MagicDNS name) |
| `NAS_USER` | SSH username on the NAS |
| `NAS_DEPLOY_PATH` | Deploy target (e.g. `/path/to/webserver/dist`) |
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID (scoped to `tag:ci`) |
| `TS_OAUTH_SECRET` | Tailscale OAuth client secret |

**Hardened deploy key:** on the NAS, the deploy key is locked down in `~/.ssh/authorized_keys`
with a forced command + `restrict`:

```
command="/var/services/homes/<nas-user>/bin/deploy-rsync-only.sh",restrict ssh-ed25519 AAAA... github-actions-deploy
```

The wrapper (`~/bin/deploy-rsync-only.sh`) permits **only** an `rsync` push and forces the
destination to your configured deploy target — no shell, no other paths, no downloads. If a
leaked key is the worst case, it can do exactly one thing: rsync into `dist`. The personal key
stays unrestricted for admin/recovery. If you ever change the rsync flags in `deploy.yml`
(e.g. add `--rsync-path`), re-test the deploy, since the wrapper only passes through standard
`rsync --server` invocations.

### Content Sync

```bash
npm run sync   # Pull latest content from Obsidian vault
```

Content lives in your Obsidian vault (set `VAULT_SUBPATH` in `deploy.env`):

| Vault folder | Destination | Purpose |
|--------------|-------------|---------|
| `projects/` | `src/content/projects/` | Project markdown files (with frontmatter) |
| `pages/` | `src/content/pages/` | Page content (home, about) |
| Referenced image embeds | `public/images/<project>/` | Web-renderable assets referenced by Obsidian embeds, grouped per content file |

Edit markdown in Obsidian → run `npm run deploy` to ship directly, **or** `npm run sync`,
commit, and push to deploy via CI.

Obsidian image embeds are supported with the `![[...]]` syntax. During sync, the
site scans committed Markdown for referenced embeds and copies only web-renderable
asset exports (`.svg`, `.png`, `.webp`, `.jpg`, `.jpeg`, `.gif`) into
`public/images/`. Only assets that are actually embedded are published — the
whole vault `images/` folder is **not** mirrored, so unreferenced files stay out
of the site. Each embed is placed in a folder mirroring its content file's
location, so a project's assets all live together (e.g. embeds in
`src/content/projects/stage-mixer.md` land in `public/images/projects/stage-mixer/`).
Raw `.excalidraw` drawing files are intentionally not published. `.heic`/`.heif`
photos (e.g. straight from an iPhone) are converted to `.webp` during sync —
browsers can't render HEIC — and the embeds are rewritten to point at the `.webp`
result. During that step photos are also auto-oriented (EXIF rotation is baked in,
so portrait shots don't render sideways), resized down to a 1600px longest edge,
and stripped of EXIF/GPS metadata. Assets whose published output is already newer
than the vault source are skipped, so re-syncing is fast and only new or changed
images are re-copied/reconverted. The sync searches the website content folder and an optional shared
Excalidraw export folder (`EXCALIDRAW_SUBPATH` in `deploy.env`), so Excalidraw
exports can live in a central drawing folder while page Markdown stays with the vault.
During build, `src/plugins/remark-obsidian-embeds.mjs` rewrites those embeds to
normal `<img>` tags — stamping intrinsic `width`/`height` (to reserve layout
space and avoid shift), inlining a tiny blur-up placeholder, and lazy-loading
every image except the first on each page, which loads eagerly as the likely
LCP element. For Excalidraw drawings, export an SVG or PNG, then embed
the drawing normally:

```md
![[Excalidraw/stage-mixer-diagram.excalidraw|stage-mixer-diagram|800x600]]
```

If an SVG export exists, that renders (from `stage-mixer.md`) as
`/images/projects/stage-mixer/stage-mixer-diagram.svg`; otherwise the renderer
uses another copied web export when available.

Obsidian callouts are also supported. Markdown such as
`> [!tip] Takeaway` renders as a styled callout instead of a plain blockquote.
Fold markers are preserved: `[!info]+` renders open by default, while `[!info]-`
renders as a collapsed disclosure that readers can expand.

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

## What I'm Listening To (Spotify widgets)

The About page shows two **Spotify** cards, fetched **client-side, only on the
About page**, so they never block rendering:

- **"What I'm listening to"** — my current Spotify track (with a live "Now
  playing" indicator) or, when nothing is playing, my most recently played track.
- **"Liked Songs"** — the five most recently saved tracks from my library.

The Spotify credentials live in a small **Cloudflare Worker** (free plan) — never
in the browser or in git. The site calls the Worker's public URLs; the Worker
holds the secrets, talks to Spotify, and returns only track metadata. It serves
two endpoints: `/now-playing` and `/liked-songs`.

- **Worker code + full setup:** [`worker/README.md`](worker/README.md) (create the
  Spotify app, mint the refresh token, store secrets, deploy, add the rate-limit rule)
- **Frontend widgets:** `src/components/NowPlaying.astro` and
  `src/components/LikedSongs.astro` (mounted in `src/pages/about.astro`)
- **Endpoint config:** `PUBLIC_NOW_PLAYING_URL` / `PUBLIC_LIKED_SONGS_URL` in
  `deploy.env`, each with a committed default in `src/config.ts`
- **Scopes:** the refresh token needs `user-read-currently-playing`,
  `user-read-recently-played`, and `user-library-read`. Adding a scope requires
  re-running `npm run spotify:token` and updating the `SPOTIFY_REFRESH_TOKEN`
  secret.

```bash
npm run spotify:token    # one-time: generate the Spotify refresh token
npm run worker:dev       # run the Worker locally (needs worker/.dev.vars)
npm run worker:deploy    # deploy the Worker to Cloudflare
```

Abuse/cost controls: short-TTL edge caching, a Cloudflare per-IP rate-limiting
rule, an Origin/Referer allowlist, and the free plan's hard request cap (no
overage billing). If the Worker is unreachable, the cards just hide.

## Testing

```bash
npm test                                     # Build + run all tests
npx vitest run tests/html-structure.test.ts  # Run a single test file
```

Tests run against the built `dist/` output (static HTML files) using [Vitest](https://vitest.dev/). This makes `npm test` a reliable gate before deploying — if the build breaks or the HTML structure regresses, tests fail.

| Test file | What it checks |
|-----------|----------------|
| `tests/build.test.ts` | `astro build` exits successfully, all page HTML files exist, 404 + sitemap + robots.txt + security.txt generated |
| `tests/html-structure.test.ts` | Key HTML elements: titles, meta tags, OG tags, navigation, headings, footer, project cards, detail content, and the About-only now-playing + liked-songs widgets |
| `tests/now-playing-worker.test.ts` | Unit tests for the Spotify Worker's pure `shapeNowPlaying()` and `shapeLikedSongs()` transforms (now-playing, recently-played, liked-songs, and empty/error states) |
| `tests/obsidian-callouts.test.mjs` | Obsidian callout rewriting for standard, expanded, and collapsed callout blockquotes |
| `tests/obsidian-embeds.test.mjs` | Obsidian embed rewriting (intrinsic dimensions, blur-up placeholders, eager/lazy loading) and asset-copy behavior for images and Excalidraw exports |
| `tests/strip-image-metadata.test.mjs` | EXIF/GPS stripping, orientation baking, and clean-image skipping in the image pipeline |
| `tests/reading-time.test.ts` | Reading-time estimation from Markdown body word count |

## Features

- **Dark/light theme** — toggle with localStorage persistence, no flash on load
- **Projects portfolio** — Astro Content Collections with Markdown, status badges, tags, and project-page tables of contents
- **Heading permalinks** — Markdown headings render clickable `#` anchor links, and table-of-contents jumps update URL hashes for deep-linking
- **Reading-time metadata** — Markdown detail pages estimate reading time from body word count and show it near the article header
- **View Transitions** — directional slide animations between pages (no full reload)
- **Back-to-top widget** — fixed scroll helper for long pages
- **Spring easing** — subtle scale animations on hover/active for buttons and links
- **Responsive design** — mobile hamburger menu, responsive grid layouts
- **Obsidian vault sync** — edit content in Obsidian, sync to site at deploy time
- **What I'm listening to** — About-page widgets showing my current/last Spotify track and my five most recently liked songs, served by a free Cloudflare Worker (see [`worker/README.md`](worker/README.md))
- **CI/CD** — push to `main` auto-builds, tests, and deploys to the NAS via GitHub Actions + Tailscale
- **SEO** — Open Graph, Twitter cards, canonical URLs, auto-generated sitemap
- **Crawler & AI control** — `robots.txt` opt-out plus nginx User-Agent blocking + rate limiting
- **Obsidian Markdown** — `![[...]]` image embeds and `[!type]` callouts render as web-native content
- **404 page** — custom styled error page

## Design System

Defined in `src/styles/global.css` using Tailwind v4's `@theme` directive:

- **Colors:** Dark/light themes with custom properties (`--color-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-muted`, `--color-accent`)
- **Fonts:** Inter (body) + JetBrains Mono (header/code) via Google Fonts
- **Layout:** Per-content widths via a shared `--container` var on `<body>`. Reading pages use `--width-prose` (45rem / 720px — the readable measure); top-level content pages use `width="content"` plus `chrome="project-detail"` to align the header/nav with the shared content rail. Project detail pages use `width="wide"`, which centers the prose reading column on the viewport and flanks it with two symmetric gutters: the **Table of Contents** on the left and a sticky project **meta rail** (`ProjectMeta` "Details" spec sheet) on the right (rail ≈ prose + a matching gutter on each side). Below the `xl` breakpoint both side rails collapse — the ToC into an in-content block and the meta into an inline header row. The About page centers its content at the prose measure. A site-wide top **reading-progress bar** (`ReadingProgress`) fills left→right as you scroll and self-hides on pages too short to scroll. Containers stay fluid below the cap, and `.prose` is capped at the measure so body text never stretches inside a wider shell.
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

Only `done` and `ongoing` projects are shown publicly. Project thumbnails are committed directly to `public/images/projects/` (e.g. `public/images/projects/project-name.svg`); they aren't pulled from the vault. Embedded images referenced with `![[...]]` are published separately under a per-project folder like `public/images/projects/project-name/`.

## Project Structure

| Path | Purpose |
|------|---------|
| `src/pages/` | Astro page routes — Home, Projects, Posts, About, 404 |
| `src/pages/projects/[slug].astro` | Dynamic project detail pages |
| `src/layouts/` | Base page layout (header + content + footer + view transitions) |
| `src/components/` | UI components (BackToTop, Header, Footer, NowPlaying, ProjectCard, ProjectMeta, ReadingProgress, ReadingTime, TableOfContents, ThemeToggle, SocialLinks) |
| `src/config.ts` | Build-time site config (e.g. the public now-playing / liked-songs Worker URLs, with committed defaults) |
| `src/lib/` | Shared TypeScript utilities, including Markdown reading-time estimation |
| `src/styles/` | CSS files: `global.css` (theme), `prose.css` (markdown typography), `transitions.css` (page animations) |
| `src/plugins/remark-obsidian-callouts.mjs` | Remark plugin that converts Obsidian callout blockquotes to styled callout elements |
| `src/plugins/remark-obsidian-embeds.mjs` | Remark plugin that converts Obsidian image embeds to web image HTML during Astro builds |
| `src/content.config.ts` | Content collection schema definition (projects + pages) |
| `src/content/projects/` | Project Markdown files (synced from Obsidian, committed so CI can build) |
| `src/content/pages/` | Page content files (synced from Obsidian, committed so CI can build) |
| `public/` | Static assets served as-is, including images, favicon, robots.txt, and `.well-known/security.txt` |
| `.github/workflows/deploy.yml` | CI/CD pipeline — build, test, and deploy to the NAS on push |
| `worker/` | Cloudflare Worker for the Spotify widgets (`/now-playing` + `/liked-songs`, self-contained: `src/index.ts`, `wrangler.toml`, `README.md`). Deployed separately via `npm run worker:deploy` |
| `tests/` | Vitest test files (build verification + HTML assertions + Obsidian Markdown handling + reading-time utility coverage) |
| `astro.config.mjs` | Astro framework configuration (Vite + Tailwind plugin + sitemap) |
| `tsconfig.json` | TypeScript configuration |
| `package.json` | Dependencies and npm scripts |
| `nginx/default.conf` | nginx config (AI/scraper UA blocking + rate limiting); rsynced to the NAS by `deploy.sh` |
| `scripts/run-local-script.mjs` | Cross-platform npm dispatcher that chooses PowerShell on Windows and Bash elsewhere |
| `scripts/sync-obsidian-assets.mjs` | Copies only web-renderable assets referenced by Obsidian embeds into per-project folders under `public/images/`; uses a manifest to clean up stale files |
| `scripts/strip-image-metadata.mjs` | Strips EXIF/GPS metadata from raster images in `public/images/`, auto-orients them (baking in EXIF rotation), resizes down to a 1600px longest edge, and converts `.heic`/`.heif` to `.webp` (via `sips` on macOS, since sharp can't decode HEIC) so the photos render fast in browsers |
| `scripts/sync-content.sh` / `scripts/sync-content.ps1` | Pull markdown content from the Obsidian vault |
| `scripts/spotify-refresh-token.mjs` | One-time OAuth helper that mints the Spotify refresh token for the widgets' Worker (scopes: currently-playing, recently-played, library-read) |
| `scripts/deploy.sh` / `scripts/deploy.ps1` | Sync + build + rsync deployment scripts |
| `dist/` | Build output (gitignored) |
| `.astro/` | Generated types and cache (gitignored) |
