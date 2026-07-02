/**
 * Site-wide runtime config resolved at build time.
 */

/**
 * Public URL of the Spotify "now-playing" Cloudflare Worker used by the
 * About-page widget. Order of precedence:
 *   1. PUBLIC_NOW_PLAYING_URL from the environment (set in deploy.env for local
 *      deploys, or a CI variable) — lets you point at a staging Worker.
 *   2. The committed default below, so CI builds and `npm run dev` work with no
 *      extra setup.
 *
 * This is NOT a secret: the Spotify credentials live only inside the Worker.
 * Resolved in server context (component frontmatter) and passed to the client
 * via a data attribute, so it never depends on client-side env inlining.
 */
const DEFAULT_NOW_PLAYING_ENDPOINT = 'https://api.mattserwinowski.com/now-playing';

const fromEnv =
  import.meta.env.PUBLIC_NOW_PLAYING_URL ??
  (typeof process !== 'undefined' ? process.env?.PUBLIC_NOW_PLAYING_URL : undefined);

export const NOW_PLAYING_ENDPOINT = (fromEnv || DEFAULT_NOW_PLAYING_ENDPOINT).trim();
