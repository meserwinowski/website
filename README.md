# Matt Serwinowski - Personal Website

A personal portfolio site built with [Astro](https://astro.build/) and [Tailwind CSS v4](https://tailwindcss.com/), served via nginx on a Synology NAS.

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
npm run deploy  # Builds the site and rsyncs dist/ to the NAS
```

This runs `deploy.sh`, which:
1. Builds the site with `astro build`
2. Rsyncs the `dist/` directory to `/path/to/webserver/dist` on the NAS
3. nginx (running in Docker) serves the files automatically

## Project Structure

| Path | Purpose |
|------|---------|
| `src/pages/` | Astro page routes (file-based routing) |
| `src/layouts/` | Reusable page layout templates |
| `src/components/` | UI components |
| `src/styles/` | Global CSS (Tailwind v4 import) |
| `public/` | Static assets served as-is (favicon, etc.) |
| `astro.config.mjs` | Astro framework configuration (Vite + Tailwind plugin) |
| `tsconfig.json` | TypeScript configuration |
| `package.json` | Dependencies and npm scripts |
| `compose.yaml` | Docker Compose config for the nginx container on the NAS |
| `deploy.sh` | Build + rsync deployment script |
| `dist/` | Build output (gitignored) |
| `.astro/` | Generated types and cache (gitignored) |
