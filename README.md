# Matt Serwinowski - Personal Website

[![Build](https://github.com/meserwinowski/website/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/meserwinowski/website/actions/workflows/deploy.yml)

A personal portfolio and posts site built with [Astro](https://astro.build/) and [Tailwind CSS v4](https://tailwindcss.com/), served via nginx on a Synology NAS. Templates and synthetic fixtures remain public; authored content and images live in a separate private publishing repository.

## Build & Deployment

### Prerequisites

- Node.js 22.18+ (with npm; the shared content pipeline uses native TypeScript support)
- Windows PowerShell 5.1+ on Windows, or Bash on macOS/Linux, for local helper scripts
- Existing SSH access as `copilot` (configured in `deploy.env`), a verified host key,
  and passwordless sudo for local rsync, stat, mkdir and the installed NAS dispatcher
- `rsync` and `ssh` on `PATH` for local deploys

### Development

```bash
npm install    # Install dependencies
npm run demo   # Assemble synthetic content; no private Git access needed
npm run dev    # Start local dev server
```

### Build

```bash
npm run build  # Generates static site in dist/
```

Build does not sync content. Prepare either synthetic inputs with `npm run demo`,
or production inputs with `npm run sync` (local vault) / `npm run content:assemble`
(private export checkout). Production deployment refuses demo inputs.

### Deploy

```bash
npm run deploy  # Syncs content, builds, tests, and deploys to the NAS
```

This runs `scripts/run-local-script.mjs`, which dispatches to PowerShell on
Windows (`deploy.ps1`) or Bash on macOS/Linux (`deploy.sh`). Both scripts:
1. Verify noninteractive SSH/sudo access before syncing or building
2. Export Obsidian content to the private publishing checkout and assemble ignored production inputs
3. Run `npm test` (Astro build, then Vitest); a failure blocks deployment
4. Upload `dist/` to a private temporary directory as `copilot`, then mirror it locally on
   the NAS to `DEPLOY_TARGET` with `sudo -n rsync --delete`, preserving the target's owner/group
5. Stage and copy nginx config with sudo, validate it and reload the existing container through
   `/volume1/docker_commands/nas-docker.sh`

Set `NAS_USER=copilot` in the git-ignored `deploy.env`; the example uses this account.
SSH uses batch mode and strict host-key checking, and every sudo call uses `-n`, so missing
access fails instead of prompting. Staging permissions are explicitly set and checked as
`0700` because Synology's inherited ACLs can override `mktemp`/`umask`. Staging avoids DSM's
disabled-root-account restriction on rsync server mode; no accounts or rsync services need
enabling. Temporary uploads are
cleaned up after success or failure. Remote paths must be non-root absolute paths containing
only letters, digits, dot, underscore, slash or hyphen, without `.` or `..` path segments.
The local `nasctl` launcher and `NASCTL_PATH` are no longer used. nginx config/reload failures
remain warnings after the site files have been published; inspect them rather than assuming
a warning means the new config is active.

### Continuous Deployment (CI/CD)

Public pushes and pull requests run [`deploy.yml`](.github/workflows/deploy.yml)
as **fixture-only build/test CI**. They never receive private content or NAS
credentials and do not deploy.

Production Actions live in the private `meserwinowski/website-content` repository.
After cutover, pushing its content branch deploys; code-only releases use:

```bash
gh workflow run deploy.yml --repo meserwinowski/website-content
```

The private workflow checks out content and trusted public `main` separately,
resolves their immutable SHAs, assembles production inputs, runs `npm test`, joins
Tailscale, and publishes through the existing restricted NAS key. Logs and the
successful release artifact stay private. Optional `code_sha` / `content_sha`
dispatch inputs replay an earlier source pair; ordinary content pushes resolve
current public main rather than reverting to an old code pointer.

Do not run a direct local deployment concurrently with hosted publication.
Local deployment remains available and does not implicitly commit or push.
Hosted deployment sees committed content, not unsaved vault changes.

**Required GitHub Secrets (in the private publishing repository):**

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
| `projects/` | Private `content/projects/` | Project Markdown, including unpublished drafts |
| `pages/` | Private `content/pages/` | Page prose, including standalone archive pages |
| `site.json` | Private `site.json` | Personalized site metadata, published-page allowlist and archive rendering data |
| Referenced embeds, thumbnails and standalone images | Private `assets/` | Metadata-stripped, web-ready exports; originals stay in the vault |

`CONTENT_REPO_DIR` defaults to the sibling `../website-content` checkout and must
be outside this public checkout. Sync replaces only its generated export paths,
never `.git` or workflow files. Review, commit and push that **private** export to
release through hosted CI. Code commits belong here; never force-add authored
inputs to this public repository.

Assembly stages only `completed`/`ongoing` and `archived` projects, allowlisted
pages, and their associated assets into ignored `src/content/` and
`public/assets/`. Draft-only images are not shipped. Missing sources/required
pages/assets and conversion failures block preparation instead of reusing stale
content. Build provenance and thumbnail manifests live in ignored
`.site-content/`, outside the served tree.

This separates source ownership, not website access: published and unlisted
archive pages remain public. Removing files from current Git does not erase
historic copies, forks or caches; history cleanup is a separately reviewed step.

Obsidian image embeds are supported with the `![[...]]` syntax. During sync, the
private exporter scans vault Markdown for referenced embeds and copies web-renderable
asset exports (`.svg`, `.png`, `.webp`, `.jpg`, `.jpeg`, `.gif`) into
private `assets/`. Production assembly publishes only referenced, eligible assets — the
whole vault `images/` folder is **not** mirrored, so unreferenced files stay out
of the site. Each embed is placed in a folder named for its content file's slug,
so a project's assets all live together (e.g. embeds in
`src/content/projects/stage-mixer.md` land in `public/assets/stage-mixer/`).
A project's frontmatter `thumbnail` is pulled the same way: a site-local
`/assets/...` thumbnail is resolved against the vault and copied to exactly that
path, so you can point a card at a vault image without also embedding it in the
body (external URLs and legacy `/images/...` paths are left untouched).
Raw `.excalidraw` drawing files are intentionally not published. `.heic`/`.heif`
photos (e.g. straight from an iPhone) are converted to `.webp` during sync —
browsers can't render HEIC — and the embeds are rewritten to point at the `.webp`
result. During that step **every** raster image is auto-oriented (EXIF rotation is
baked in, so portrait shots don't render sideways), downscaled to a 2048px longest
edge if larger (full-resolution WebP/JPEG exported straight from the vault included,
not just HEIC), re-encoded to match its file extension (repairing a mislabeled file
such as PNG bytes saved as `.webp`), and stripped of EXIF/GPS metadata. Assets whose published output is already newer
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
`/assets/stage-mixer/stage-mixer-diagram.svg`; otherwise the renderer
uses another copied web export when available.

Project **card** thumbnails get a further optimization. Cards render the
thumbnail in a fixed ~300px 16:9 tile, so shipping the full-size synced asset
(up to 2048px) wastes bandwidth. `scripts/generate-card-thumbnails.mjs` runs at
build time (the `prebuild` npm script), center-crops each raster thumbnail to
16:9, and emits small `400w`/`800w` WebP derivatives plus a manifest describing
the responsive `srcset`, intrinsic dimensions, and a tiny inline blur-up LQIP.
`ProjectCard.astro` reads that manifest (via `src/lib/cardThumbnail.ts`) and
renders the derivatives with `srcset`/`sizes`, lazy loading below the fold, and
the blur-up placeholder; the first card on the home feed loads eagerly as the
likely LCP. SVG/external/missing thumbnails fall back to the raw path. The
derivatives + manifest are gitignored and regenerated on every build.

Obsidian callouts are also supported. Markdown such as
`> [!tip] Takeaway` renders as a styled callout instead of a plain blockquote.
Fold markers are preserved: `[!info]+` renders open by default, while `[!info]-`
renders as a collapsed disclosure that readers can expand.

Code fences can be folded the same way. A `fold:` token in the fence info string
— e.g. ` ```yaml fold:compose.yaml ` — renders the highlighted code inside a
collapsed `<details>` disclosure titled `compose.yaml` (the language name is used
when no title is given). It shares the smooth open/close animation with callouts.

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

The local deploy scripts rsync `nginx/default.conf` to the NAS and run
`nginx -t && nginx -s reload` through the already installed NAS dispatcher on every
deploy (best-effort; it never fails the site deploy). Config rsync uses `--inplace` so the
single-file bind mount keeps seeing the updated inode.

**One-time activation** (the bind mount must exist before a reload can pick up the file). The
`webserver` stack's `compose.yaml` (which carries the `nginx/default.conf` mount) lives in the
external NAS toolkit, not in this repo. If the mount needs adding or changing, rebuild
the project through Synology Container Manager so DSM retains project ownership.

After that, routine deploys reload nginx in place — no recreate needed.

If scraping ever gets bad despite this, put Cloudflare (free tier) in front and enable
its "Block AI Scrapers and Crawlers" managed rule to catch User-Agent spoofers.

`public/.well-known/security.txt` is copied verbatim to
`dist/.well-known/security.txt` on build. This gives scanners and security
researchers a standard contact record for the site, including the canonical URL
that Cloudflare and other checks expect.

## RSS feed

The combined site feed is published at
[`/rss.xml`](https://www.mattserwinowski.com/rss.xml). It currently includes
completed and ongoing projects, newest first, with each item containing its
title, publication date, and canonical project link. Future posts will be added
to the same feed.

Every page advertises the feed with RSS autodiscovery metadata. The RSS icon in
the header jumps to the footer subscription section. The footer's email field is
transitional: submitting a valid address opens the RSS feed, but the address has
no form name and is not collected, sent, or stored. Real email delivery remains
future work.

## NAS container management

The `webserver` project is owned by **Synology Container Manager**. Container replacement
and image upgrades go through DSM, not an external Compose recreate. Compose definitions
and the generic NAS maintenance toolkit live outside this repo in OneDrive.

Website deployment uses only the dispatcher already installed on the NAS; it does not
invoke the local `nasctl` launcher, which can synchronize unrelated maintenance files.
For example, validate the running container's config without deploying or reloading:

```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 \
  -o RemoteCommand=none -o RequestTTY=no copilot@mainecoon \
  'sudo -n /volume1/docker_commands/nas-docker.sh ctl webserver_nginx exec nginx -t'
```

The scripts neither install the dispatcher nor change SSH keys, sudoers or container
ownership. Those prerequisites must already be configured.

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
| `tests/generate-card-thumbnails.test.mjs` | Card-thumbnail generator: 16:9 WebP derivatives + manifest (srcset/dims/LQIP), idempotent re-runs, and SVG/external/missing skips |
| `tests/collapsible-code.test.mjs` | `fold:` code-fence rewriting into collapsible `<details>` (title fallbacks, meta stripping, untouched plain fences) |
| `tests/obsidian-embeds.test.mjs` | Obsidian embed rewriting (intrinsic dimensions, blur-up placeholders, eager/lazy loading) and asset-copy behavior for images and Excalidraw exports |
| `tests/strip-image-metadata.test.mjs` | EXIF/GPS stripping, orientation baking, and clean-image skipping in the image pipeline |
| `tests/reading-time.test.ts` | Reading-time estimation from Markdown body word count |
| `tests/local-deploy.test.mjs` | Mocked deployment gates, private staging, ownership preservation, nginx validation/reload ordering, and cleanup |
| `tests/content-pipeline.test.mjs` | Publication filtering, demo refusal, path/image validation, shared frontmatter schemas, export preservation and conversion-cache reuse |

On macOS/Linux, the deployment checks run Bash and, when `pwsh` is available, PowerShell
with both standard and legacy native argument handling. Set `PWSH_BINARY` to use a portable
PowerShell executable. SSH, rsync, content sync and npm are mocked; these checks never
contact the NAS.

## Features

- **Dark/light theme** — toggle with localStorage persistence, no flash on load
- **Projects portfolio** — Astro Content Collections with Markdown, status badges, tags, and project-page tables of contents
- **Content archive** — retired pages and projects remain available at unlisted, non-indexed `/archive/<slug>/` URLs
- **Heading permalinks** — Markdown headings render clickable `#` anchor links, and table-of-contents jumps update URL hashes for deep-linking
- **Reading-time metadata** — Markdown detail pages estimate reading time from body word count and show it near the article header
- **View Transitions** — directional slide animations between pages (no full reload)
- **Back-to-top widget** — fixed scroll helper for long pages
- **Spring easing** — subtle scale animations on hover/active for buttons and links
- **Responsive design** — mobile hamburger menu, responsive grid layouts
- **Obsidian vault sync** — edit content in Obsidian, sync to site at deploy time
- **What I'm listening to** — About-page widgets showing my current/last Spotify track and my five most recently liked songs, served by a free Cloudflare Worker (see [`worker/README.md`](worker/README.md))
- **CI/CD** — public fixture builds on code pushes; private content pushes or explicit dispatch deploy through Tailscale
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

Create a Markdown file in the vault's Website `projects/` folder with this
frontmatter (or add a synthetic fixture when contributing public template code):

```yaml
---
title: "Project Name"
description: "Short one-liner for the card"
status: "completed"  # completed | ongoing | planning | draft | archived
tags: ["software", "hardware"]
thumbnail: "/assets/project-name/thumbnail.webp"
date: 2026-06-01
repo: "https://github.com/..."  # optional
---

Your markdown content here...
```

Only `completed` and `ongoing` projects appear on the home page, projects index,
live project routes, and RSS feed. Set a retired project's status to `archived`
in the Obsidian vault to move it to `/archive/<slug>/`; the original
`/projects/<slug>/` URL will return the normal 404 page. Archive routes are
unlisted, excluded from the sitemap, and marked `noindex`.

A project's `thumbnail` is any path served from `public/`. The convention is to point it at a site-local `/assets/...` path — either an image in that project's per-slug asset folder (`/assets/<slug>/<file>`, reusing a photo already synced via an `![[...]]` embed, e.g. `stage-mixer.md` uses `/assets/stage-mixer/matt-vb-show.webp`) or a standalone image at the assets root (`/assets/<name>.png`). Either way the sync **pulls the referenced file from the vault to that exact path** — resolving it by name and downscaling/optimizing it like any other asset — so the thumbnail no longer has to also be embedded in the body or hand-committed. Embedded images referenced with `![[...]]` are published under the same per-slug folder, so a project's thumbnail and body images live together.

## Project Structure

| Path | Purpose |
|------|---------|
| `src/pages/` | Astro page routes — Home, Projects, Posts, About, 404 |
| `src/pages/projects/[slug].astro` | Dynamic project detail pages |
| `src/pages/archive/` | Unlisted archive index, archived-project route, and retained standalone pages |
| `src/data/archivePages.ts` | Standalone archive registry derived from private/generated site data |
| `src/layouts/` | Base page layout (header + content + footer + view transitions) |
| `src/components/` | UI components (BackToTop, Header, Footer, NowPlaying, ProjectCard, ProjectDetail, ProjectMeta, ReadingProgress, ReadingTime, TableOfContents, ThemeToggle, SocialLinks) |
| `src/config.ts` | Build-time site config (e.g. the public now-playing / liked-songs Worker URLs, with committed defaults) |
| `src/lib/` | Shared TypeScript utilities, including Markdown reading-time estimation and project visibility rules |
| `src/styles/` | CSS files: `global.css` (theme), `prose.css` (markdown typography), `transitions.css` (page animations) |
| `src/plugins/remark-obsidian-callouts.mjs` | Remark plugin that converts Obsidian callout blockquotes to styled callout elements |
| `src/plugins/remark-collapsible-code.mjs` | Remark plugin that converts `fold:`-tagged code fences into collapsible `<details>` disclosures |
| `src/plugins/remark-obsidian-embeds.mjs` | Remark plugin that converts Obsidian image embeds to web image HTML during Astro builds |
| `src/content.config.ts` | Content collections wired to the shared projects/pages schemas |
| `src/lib/contentSchemas.ts` | Frontmatter schemas shared by Astro and the private vault exporter |
| `src/content/projects/` | Ignored, assembled publishable project Markdown |
| `src/content/pages/` | Ignored, assembled allowlisted page Markdown |
| `.site-content/` | Ignored site metadata, source provenance and thumbnail manifest (not served) |
| `tests/fixtures/site/` | Original synthetic content/assets for independent public development and CI |
| `public/` | Static assets served as-is, including images, favicon, robots.txt, and `.well-known/security.txt` |
| `.github/workflows/deploy.yml` | Public fixture-only build/test CI; production Actions live privately |
| `worker/` | Cloudflare Worker for the Spotify widgets (`/now-playing` + `/liked-songs`, self-contained: `src/index.ts`, `wrangler.toml`, `README.md`). Deployed separately via `npm run worker:deploy` |
| `tests/` | Vitest test files (build verification + HTML assertions + Obsidian Markdown handling + reading-time utility coverage) |
| `astro.config.mjs` | Astro framework configuration (Vite + Tailwind plugin + sitemap) |
| `tsconfig.json` | TypeScript configuration |
| `package.json` | Dependencies and npm scripts |
| `nginx/default.conf` | nginx config (AI/scraper UA blocking + rate limiting); rsynced to the NAS by `deploy.sh` |
| `scripts/run-local-script.mjs` | Cross-platform npm dispatcher that chooses PowerShell on Windows and Bash elsewhere |
| `scripts/content-pipeline.mjs` | Shared vault export, explicit demo/production assembly, and production-mode gate |
| `scripts/sync-obsidian-assets.mjs` | Shared embed/thumbnail asset resolution and incremental copying; the content pipeline supplies its private asset destination |
| `scripts/generate-card-thumbnails.mjs` | Build-time (`prebuild`) step that emits small 16:9 `400w`/`800w` WebP derivatives + a manifest (srcset, dimensions, blur-up LQIP) so project cards don't download full-size thumbnails; derivatives are gitignored and regenerated each build |
| `scripts/strip-image-metadata.mjs` | Strips EXIF/GPS metadata from raster images in `public/assets/`, auto-orients them (baking in EXIF rotation), downscales any image over a 2048px longest edge, re-encodes each to match its file extension (repairing mislabeled formats), and converts `.heic`/`.heif` to `.webp` (via `sips` on macOS, since sharp can't decode HEIC) so the photos render fast in browsers |
| `scripts/sync-content.sh` / `scripts/sync-content.ps1` | Pull markdown content from the Obsidian vault |
| `scripts/spotify-refresh-token.mjs` | One-time OAuth helper that mints the Spotify refresh token for the widgets' Worker (scopes: currently-playing, recently-played, library-read) |
| `scripts/deploy.sh` / `scripts/deploy.ps1` | Sync + build + rsync deployment scripts |
| `dist/` | Build output (gitignored) |
| `.astro/` | Generated types and cache (gitignored) |
