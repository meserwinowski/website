/**
 * cardThumbnail.ts — Resolve a project thumbnail to a responsive card image.
 *
 * Project cards should not download the full-size synced thumbnail to paint a
 * ~300px 16:9 tile. `scripts/generate-card-thumbnails.mjs` runs before the build
 * (the `prebuild` npm script) and writes small WebP derivatives plus a manifest
 * — keyed by the raw frontmatter `thumbnail` path — describing each card image's
 * `srcset`, intrinsic dimensions, and a tiny inline LQIP blur-up.
 *
 * This module reads that manifest at build time (Astro renders components in
 * Node during SSG) and hands `ProjectCard.astro` the data it needs. Anything not
 * in the manifest — SVGs, external URLs, a not-yet-synced file, or a plain
 * `astro dev` run before the manifest exists — falls back to the raw path so the
 * card always renders something.
 *
 * It lives in a plain `.ts` module (not an Astro component) so the lookup logic
 * can be unit tested directly.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Responsive image data for one card thumbnail. */
export interface CardThumbnail {
  /** Default `src` (the 1× derivative, or the raw path when unoptimized). */
  src: string;
  /** Responsive `srcset` candidate list; absent for unoptimized fallbacks. */
  srcset?: string;
  /** `sizes` hint describing how wide the card renders. */
  sizes?: string;
  /** Intrinsic width in px, for aspect-ratio reservation (no layout shift). */
  width?: number;
  /** Intrinsic height in px. */
  height?: number;
  /** Tiny inline blur-up data URI painted behind the image while it loads. */
  lqip?: string;
}

/** Shape of a manifest entry as written by the generator script. */
interface ManifestEntry {
  src: string;
  srcset: string;
  width: number;
  height: number;
  lqip: string;
}

/**
 * `sizes` for a card image. Cards fill the column: near full-width on phones,
 * then a fixed ~400px column once the grid has room. This lets the browser pick
 * the 400w derivative at 1× and the 800w derivative at 2× DPI.
 */
export const CARD_IMAGE_SIZES = '(max-width: 640px) 100vw, 400px';

// Resolve from the project root (`process.cwd()`) rather than `import.meta.url`:
// this module is bundled by Vite during `astro build`, so its own URL points at
// a build chunk, not `src/lib/`. Every entry point that renders cards — `astro
// build`, `astro dev`, and vitest — runs from the repo root, where the generator
// writes the manifest.
const manifestPath = resolve(process.cwd(), 'public', 'assets', '.card-thumbnails.json');

/**
 * Load and cache the generated manifest.
 *
 * A missing or unreadable manifest is not an error: it just means nothing has
 * been optimized yet, so every thumbnail falls back to its raw path.
 */
let manifestCache: Record<string, ManifestEntry> | null = null;

function loadManifest(): Record<string, ManifestEntry> {
  if (manifestCache) {
    return manifestCache;
  }

  try {
    manifestCache = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, ManifestEntry>;
  } catch {
    manifestCache = {};
  }

  return manifestCache;
}

/**
 * Resolve a frontmatter `thumbnail` value to responsive card-image data.
 *
 * @param thumbnail Raw thumbnail path from project frontmatter (may be nullish).
 * @returns Responsive image data, or `null` when there is no thumbnail at all
 *          (the card then renders its text-tile fallback).
 */
export function resolveCardThumbnail(thumbnail?: string | null): CardThumbnail | null {
  if (!thumbnail) {
    return null;
  }

  const entry = loadManifest()[thumbnail];

  if (!entry) {
    // Unoptimized (SVG/external/missing): use the raw path as-is.
    return { src: thumbnail };
  }

  return {
    src: entry.src,
    srcset: entry.srcset,
    sizes: CARD_IMAGE_SIZES,
    width: entry.width,
    height: entry.height,
    lqip: entry.lqip,
  };
}
