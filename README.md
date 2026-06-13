# Matt Serwinowski - Personal Website

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

### Content Sync

```bash
npm run sync   # Pull latest content from Obsidian vault
```

Content lives in your Obsidian vault at `~/Library/CloudStorage/OneDrive-Personal/obsidian/vault/Projects/Website/`:

| Vault folder | Destination | Purpose |
|--------------|-------------|---------|
| `projects/` | `src/content/projects/` | Project markdown files (with frontmatter) |
| `pages/` | `src/content/pages/` | Page content (home, about) |

Edit markdown in Obsidian → run `npm run deploy` → changes go live.

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
| `src/content/projects/` | Project Markdown files (gitignored — synced from Obsidian) |
| `src/content/pages/` | Page content files (gitignored — synced from Obsidian) |
| `public/` | Static assets served as-is (images, favicon) |
| `tests/` | Vitest test files (40 tests: build verification + HTML assertions) |
| `astro.config.mjs` | Astro framework configuration (Vite + Tailwind plugin + sitemap) |
| `tsconfig.json` | TypeScript configuration |
| `package.json` | Dependencies and npm scripts |
| `compose.yaml` | Docker Compose config for the nginx container on the NAS |
| `scripts/sync-content.sh` | Pulls markdown content from Obsidian vault |
| `scripts/deploy.sh` | Sync + build + rsync deployment script |
| `dist/` | Build output (gitignored) |
| `.astro/` | Generated types and cache (gitignored) |
