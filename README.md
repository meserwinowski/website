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

## Testing

```bash
npm test                                     # Build + run all tests
npx vitest run tests/html-structure.test.ts  # Run a single test file
```

Tests run against the built `dist/` output (static HTML files) using [Vitest](https://vitest.dev/). This makes `npm test` a reliable gate before deploying — if the build breaks or the HTML structure regresses, tests fail.

| Test file | What it checks |
|-----------|----------------|
| `tests/build.test.ts` | `astro build` exits successfully, all page HTML files exist, 404 + sitemap generated |
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
- **404 page** — custom styled error page

## Design System

Defined in `src/styles/global.css` using Tailwind v4's `@theme` directive:

- **Colors:** Dark/light themes with custom properties (`--color-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-muted`, `--color-accent`)
- **Fonts:** Inter (body) + JetBrains Mono (header/code) via Google Fonts
- **Layout:** Centered content column (`max-w-3xl` / 720px)
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
| `public/` | Static assets served as-is (images, favicon) |
| `.github/workflows/deploy.yml` | CI/CD pipeline — build, test, and deploy to the NAS on push |
| `tests/` | Vitest test files (39 tests: build verification + HTML assertions) |
| `astro.config.mjs` | Astro framework configuration (Vite + Tailwind plugin + sitemap) |
| `tsconfig.json` | TypeScript configuration |
| `package.json` | Dependencies and npm scripts |
| `compose.yaml` | Docker Compose config for the nginx container on the NAS |
| `scripts/sync-content.sh` | Pulls markdown content from Obsidian vault |
| `scripts/deploy.sh` | Sync + build + rsync deployment script |
| `dist/` | Build output (gitignored) |
| `.astro/` | Generated types and cache (gitignored) |
