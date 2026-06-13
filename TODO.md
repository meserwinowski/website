# TODO

Roadmap for mattserwinowski.com — a portfolio + posts site showcasing software, hardware/maker, and music projects.

## Design Inspirations

- **Obsidian / VS Code / Claude Code / GitHub Copilot** — fluid, minimal UI with dark themes
- **gwern.net** — clean typography, sidenotes, content-dense essays
- **ciechanow.ski** — interactive visuals, beautiful animations, educational deep-dives

Common threads: content-first, excellent typography, dark aesthetic, purposeful (not flashy) interactions.

---

## Phase 1: Foundation

- [x] Design system — choose fonts (monospace + sans-serif), color palette, spacing scale
- [x] Site layout — nav bar/header, content area, footer
- [x] Dark theme as default (light toggle optional/later)
- [x] Pages: Home, Projects, Posts, About
- [x] Responsive design (mobile-friendly)
- [x] Dark/light theme toggle with localStorage persistence
- [x] Spring easing micro-interactions on buttons/links

## Phase 2: Projects Portfolio

- [x] Content collection schema (`src/content.config.ts`) with typed frontmatter
- [x] Projects index page with card grid (thumbnail, status badge, tags)
- [x] Individual project detail pages with Markdown rendering (dynamic `[slug]` routes)
- [x] Support for images, code blocks, tables, and rich Markdown content
- [x] Status filtering — only `done` and `ongoing` shown publicly
- [x] Sorted by date (newest first)
- [x] Prose typography styles for rendered Markdown
- [x] View Transitions with directional slide animations
- [x] Educational HTML comments across all `.astro` files
- [x] 35 tests passing (build verification + HTML structure assertions)

## Phase 3: Polish & Content

- [x] Home page — renders Markdown content from Obsidian vault (pages collection)
- [x] About page — renders Markdown content from Obsidian vault (pages collection)
- [x] SEO: Open Graph meta tags, Twitter cards, canonical URLs, sitemap (`@astrojs/sitemap`)
- [x] 404 page (custom styled, with link back to home)
- [x] Content sync script (`sync-content.sh`) — pulls from Obsidian vault before build
- [x] Deploy script updated to auto-sync before building
- [ ] Favicon and social sharing image

## Phase 4: Advanced (future)

- [ ] Interactive components (inspired by ciechanow.ski) — Astro Islands with Svelte/React
- [ ] Sidenotes or margin notes (gwern-style)
- [ ] Search functionality
- [ ] Analytics (privacy-friendly, e.g. Plausible or Umami)
- [ ] CI/CD — auto-deploy on push (GitHub Actions → SSH to NAS)
- [ ] Additional tests (Playwright e2e, Lighthouse CI, visual regression)

## Phase 5: Posts (when content is ready)

- [ ] Markdown content collections (Astro Content Collections API)
- [ ] Posts index page with post list (title, date, description)
- [ ] Individual post layout with good typography
- [ ] Code syntax highlighting (Shiki — built into Astro)
- [ ] RSS feed (`@astrojs/rss`)

## Phase 6: Background Effects & Micro-animations

Inspired by [performativeUI](https://vorpus.github.io/performativeUI/) — subtle, performant visual effects that don't slow page load or cause jank.

**Constraints:**
- Must not increase initial page load noticeably (lazy-load or CSS-only where possible)
- No layout shift or glitchiness
- Respect `prefers-reduced-motion` for accessibility
- Use Astro Islands (load JS only when needed)

**Ideas to explore:**
- [ ] Animated gradient background (subtle, CSS-only aurora/mesh gradient)
- [ ] Particle/starfield effect (canvas-based, lazy-loaded, behind content)
- [ ] Glow or shimmer on hover for cards/buttons
- [ ] Smooth page transitions between routes
- [x] ~~Smooth page transitions between routes~~ (done — directional View Transitions)
- [ ] Animated text reveal on first load (fade-in / slide-up for headings)
- [ ] Subtle noise/grain texture overlay (CSS-only)

**Reference libraries (pick components, don't install whole libs):**
- [performativeUI](https://github.com/vorpus/performativeUI) — gradient backgrounds, sparkles, glow effects
- [shadcn.io/backgrounds](https://www.shadcn.io/background) — 100+ animated backgrounds (particles, aurora, dots)
- [Aceternity UI](https://ui.aceternity.com/components) — hero sections, animated backgrounds (Tailwind + Framer Motion)

## Phase 7: Gifts Subdomain (`gifts.mattserwinowski.com`)

Private gift list + clothing measurements page for family, served from the same nginx container via virtual hosting.

### Architecture

- Same nginx container on port 8088, using `server_name` to route by hostname
- Custom `nginx.conf` with separate server blocks for `www` and `gifts`
- Gifts content in a separate directory on the NAS (`/path/to/webserver/gifts`)
- Source content lives as Markdown in the Obsidian vault

### Nginx config (`/path/to/webserver/nginx.conf`)

```nginx
server {
    listen 80;
    server_name www.mattserwinowski.com;
    root /usr/share/nginx/html;
    index index.html;
}

server {
    listen 80;
    server_name gifts.mattserwinowski.com;
    root /usr/share/nginx/gifts;
    index index.html;
}
```

### Updated `compose.yaml`

```yaml
volumes:
  - /path/to/webserver/dist:/usr/share/nginx/html:rw
  - /path/to/webserver/gifts:/usr/share/nginx/gifts:rw
  - /path/to/webserver/nginx.conf:/etc/nginx/conf.d/default.conf:ro
```

### Steps

- [ ] Create custom `nginx.conf` with both server blocks
- [ ] Update `compose.yaml` to mount the config and gifts volume
- [ ] Add DNS record for `gifts.mattserwinowski.com` in Cloudflare (A or CNAME, proxied)
- [ ] Gate access with Cloudflare Access (Zero Trust → Applications, email-based one-time codes)
- [ ] Build/deploy the gifts page (convert Obsidian markdown to static HTML)
- [ ] Decide on sync strategy (manual redeploy vs. file watcher on NAS)

---

## Next Action

Finish **Phase 3** — create a favicon and social sharing image. Then move on to **Phase 4** (advanced features) or **Phase 5** (posts) depending on priority.
