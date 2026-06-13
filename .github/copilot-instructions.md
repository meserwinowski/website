# Copilot Instructions

## Commands

```bash
npm run build       # Build static site to dist/
npm test            # Build + run all Vitest tests
npx vitest run tests/html-structure.test.ts  # Run a single test file
npm run dev         # Local dev server
npm run deploy      # Build + rsync to production (NAS)
```

## Architecture

Static site built with **Astro 6** + **Tailwind CSS v4**, deployed to a Synology NAS running nginx in Docker.

- Tailwind is integrated via the `@tailwindcss/vite` plugin (not `@astrojs/tailwind` — that's for Tailwind v3)
- All pages use `src/layouts/Base.astro` which provides `<Header />`, `<main>`, and `<Footer />`
- Tests run against the built `dist/` output (static HTML), not the source — always build before testing
- Deployment is rsync over SSH to `your-nas-host` (Tailscale hostname). The `compose.yaml` in this repo is the Docker config running _on the NAS_, not locally.

## Design System

Defined in `src/styles/global.css` using Tailwind v4's `@theme` directive:

- Colors are CSS custom properties: `--color-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-muted`, `--color-accent`, `--color-accent-hover`
- Use these via `var(--color-*)` in Tailwind arbitrary values: `text-[var(--color-muted)]`
- Fonts: Inter (sans), JetBrains Mono (mono) — loaded from Google Fonts in `Base.astro`
- Dark theme only. Content max-width is `max-w-3xl` (720px).

## Conventions

- Always check if the README.md or TODO.md need to be updated after making changes to the codebase. These files are the source of truth for project structure, commands, and roadmap.
- Page titles follow the pattern: `"PageName - Matt Serwinowski"` (home is just `"Matt Serwinowski"`)
- New pages go in `src/pages/` (Astro file-based routing)
- Shared UI goes in `src/components/`
- Navigation links are defined in `src/components/Header.astro` — update the `navLinks` array when adding pages
- Tests must be updated when adding new pages (check `tests/build.test.ts` for page existence and `tests/html-structure.test.ts` for structure assertions)
