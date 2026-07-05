/**
 * Cloudflare Worker: "What I'm listening to" (Spotify now-playing) endpoint.
 *
 * Serves a tiny public JSON document describing the track I'm currently playing
 * on Spotify — or, if nothing is playing, the most recently played track. The
 * static site fetches this client-side, only on the About page.
 *
 * Design goals (see worker/README.md and the project plan):
 *   - Free-plan friendly: short-TTL edge caching collapses traffic so heavy
 *     visits become ~1 Spotify subrequest per minute.
 *   - Abuse-resistant: strict Origin/Referer allowlist + CORS, fast timeouts,
 *     and fail-closed responses. A Cloudflare per-IP rate-limiting rule sits in
 *     front of this Worker (configured in the dashboard).
 *   - Resilient: any upstream/credential error returns HTTP 200 with
 *     { isPlaying: false } so the widget simply hides — it never surfaces an
 *     error to the visitor.
 *   - Secrets never leave the Worker: only public track metadata is returned.
 */

/** Runtime bindings Cloudflare passes to the Worker on each request. */
export interface Env {
  // Secrets — set once with `wrangler secret put` (never committed):
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  SPOTIFY_REFRESH_TOKEN: string;
  // Non-secret var from wrangler.toml. Comma-separated list of allowed origins.
  ALLOWED_ORIGIN?: string;
}

/** Minimal, non-sensitive payload returned to the browser. */
export interface NowPlaying {
  isPlaying: boolean;
  title?: string;
  artist?: string;
  album?: string;
  albumImageUrl?: string;
  songUrl?: string;
  /** Present only on the recently-played fallback. */
  playedAt?: string;
}

/** A single track in the "Liked Songs" list — public metadata only. */
export interface LikedSong {
  title?: string;
  artist?: string;
  album?: string;
  albumImageUrl?: string;
  songUrl?: string;
  /** When I saved the track to my library (ISO 8601). */
  addedAt?: string;
}

/** Payload for the `/liked-songs` endpoint: newest-saved tracks first. */
export interface LikedSongsPayload {
  tracks: LikedSong[];
}

const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const CURRENTLY_PLAYING_ENDPOINT =
  'https://api.spotify.com/v1/me/player/currently-playing';
const RECENTLY_PLAYED_ENDPOINT =
  'https://api.spotify.com/v1/me/player/recently-played?limit=1';
// Saved-tracks library ("Liked Songs"), newest first. Requires the
// user-library-read scope on the refresh token.
const SAVED_TRACKS_ENDPOINT = 'https://api.spotify.com/v1/me/tracks?limit=5';

// How long browsers/edge may reuse the response. Keeps us far under the free
// plan's daily cap and shields Spotify from bursts.
const CACHE_TTL_SECONDS = 60;
// Liked Songs change rarely, so cache them longer than now-playing.
const LIKED_CACHE_TTL_SECONDS = 300;
// Upstream calls fail fast so a slow Spotify never ties up the Worker.
const UPSTREAM_TIMEOUT_MS = 4000;

const NOT_PLAYING: NowPlaying = { isPlaying: false };
const EMPTY_LIKED: LikedSongsPayload = { tracks: [] };

/**
 * Access-token memoization at the isolate level. Spotify access tokens live for
 * ~1 hour; caching avoids a token refresh on every request within an isolate.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

export default {
  /**
   * Cloudflare calls this fetch handler for every request routed to the Worker.
   * It acts like a tiny serverless web server: answer CORS, reject disallowed
   * callers, reuse edge-cached JSON when possible, then query Spotify only when
   * the cache misses.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin');
    const allowOrigin = resolveAllowedOrigin(origin, request, env);
    const corsHeaders = buildCorsHeaders(allowOrigin);

    // CORS preflight: browsers ask permission with OPTIONS before some cross-
    // origin requests. A 204 plus CORS headers says the real GET may proceed.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // The API is read-only. Unsupported methods still get the safe "hide the
    // widget" payload shape, but with the proper HTTP status for clients.
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json(NOT_PLAYING, { status: 405, headers: corsHeaders });
    }

    // Origin/Referer allowlist: block hotlinking / cross-site abuse. Same-origin
    // navigations and tools without an Origin header (curl) are allowed to read,
    // but browsers on other sites cannot (CORS pins Access-Control-Allow-Origin).
    if (!isRequestAllowed(origin, request, env)) {
      return json(NOT_PLAYING, { status: 403, headers: corsHeaders });
    }

    // The custom domain routes every path to this Worker, so branch on the path:
    // `/liked-songs` serves the saved-tracks list; everything else is now-playing.
    const url = new URL(request.url);
    const isLiked = url.pathname === '/liked-songs';
    const ttl = isLiked ? LIKED_CACHE_TTL_SECONDS : CACHE_TTL_SECONDS;

    // Cache API = Cloudflare's edge response cache. It is separate from
    // browser local cache, and lets nearby visitors share one Spotify result.
    const cache = caches.default;
    // Normalize HEAD/GET to a GET key so both methods reuse the same object.
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) {
      return withCors(cached, corsHeaders);
    }

    let payload: NowPlaying | LikedSongsPayload;
    let hasData: boolean;
    try {
      if (isLiked) {
        const liked = await getLikedSongs(env);
        payload = liked;
        hasData = liked.tracks.length > 0;
      } else {
        const np = await getNowPlaying(env);
        payload = np;
        // Only cache real results — don't pin a transient failure for a full TTL.
        hasData = Boolean(np.isPlaying || np.title);
      }
    } catch {
      // Fail closed: never surface an error to the visitor.
      payload = isLiked ? EMPTY_LIKED : NOT_PLAYING;
      hasData = false;
    }

    const response = json(payload, {
      status: 200,
      headers: {
        ...corsHeaders,
        // Browser caches and shared caches get the same short TTL. The explicit
        // Cache API write below is what stores successful responses at the edge.
        'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`,
      },
    });

    if (hasData) {
      // waitUntil lets the response return immediately while Cloudflare stores a
      // clone in the edge cache in the background.
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },
};

/**
 * Fetch the current track, falling back to the most recently played track.
 *
 * Spotify returns 204 when nothing is playing, so the fallback keeps the widget
 * useful without pretending an old track is live.
 */
export async function getNowPlaying(env: Env): Promise<NowPlaying> {
  const token = await getAccessToken(env);

  const current = await spotifyFetch(CURRENTLY_PLAYING_ENDPOINT, token);
  // 204 = nothing currently playing. 200 with a body = maybe playing.
  if (current && current.status === 200) {
    const body = await current.json().catch(() => null);
    const shaped = shapeNowPlaying(body, 'current');
    if (shaped.isPlaying) return shaped;
  }

  const recent = await spotifyFetch(RECENTLY_PLAYED_ENDPOINT, token);
  if (recent && recent.status === 200) {
    const body = await recent.json().catch(() => null);
    return shapeNowPlaying(body, 'recent');
  }

  return NOT_PLAYING;
}

/**
 * Pure transform from a Spotify API body to our public payload. Kept dependency-
 * and network-free so it can be unit tested directly.
 *
 * @param body   Parsed JSON from currently-playing or recently-played.
 * @param source 'current' for currently-playing, 'recent' for recently-played.
 */
export function shapeNowPlaying(
  body: any,
  source: 'current' | 'recent',
): NowPlaying {
  if (!body || typeof body !== 'object') return NOT_PLAYING;

  if (source === 'current') {
    const item = body.item;
    // Only treat as "now playing" when Spotify says so and there is a track.
    if (!body.is_playing || !item) return NOT_PLAYING;
    return { isPlaying: true, ...shapeTrack(item) };
  }

  // Recently played: take the first (most recent) history entry.
  const entry = Array.isArray(body.items) ? body.items[0] : null;
  const track = entry?.track;
  if (!track) return NOT_PLAYING;
  return {
    isPlaying: false,
    ...shapeTrack(track),
    ...(typeof entry.played_at === 'string' ? { playedAt: entry.played_at } : {}),
  };
}

/** Fetch the most recently saved "Liked Songs" and shape them for the browser. */
export async function getLikedSongs(env: Env): Promise<LikedSongsPayload> {
  const token = await getAccessToken(env);
  const res = await spotifyFetch(SAVED_TRACKS_ENDPOINT, token);
  if (res && res.status === 200) {
    const body = await res.json().catch(() => null);
    return shapeLikedSongs(body);
  }
  return EMPTY_LIKED;
}

/**
 * Pure transform from a Spotify saved-tracks body to the public liked-songs
 * payload. Network- and dependency-free so it can be unit tested directly.
 * Entries without a usable track are dropped; each surviving track carries its
 * `addedAt` timestamp when present.
 */
export function shapeLikedSongs(body: any): LikedSongsPayload {
  if (!body || typeof body !== 'object' || !Array.isArray(body.items)) {
    return { tracks: [] };
  }
  const tracks = body.items
    .map((entry: any): LikedSong | null => {
      const track = entry?.track;
      if (!track || !track.name) return null;
      return {
        ...shapeTrack(track),
        ...(typeof entry.added_at === 'string' ? { addedAt: entry.added_at } : {}),
      };
    })
    .filter((t: LikedSong | null): t is LikedSong => t !== null);
  return { tracks };
}

/** Extract the common, non-sensitive track fields shared by Spotify responses. */
function shapeTrack(track: any): Omit<NowPlaying, 'isPlaying' | 'playedAt'> {
  const artists = Array.isArray(track?.artists)
    ? track.artists.map((a: any) => a?.name).filter(Boolean).join(', ')
    : undefined;
  const images = track?.album?.images;
  // Spotify includes multiple album-art sizes; the first URL is enough for this
  // small widget, and the browser can downscale it as needed.
  const albumImageUrl = Array.isArray(images) && images.length > 0
    ? images[0]?.url
    : undefined;
  return {
    title: track?.name ?? undefined,
    artist: artists || undefined,
    album: track?.album?.name ?? undefined,
    albumImageUrl: albumImageUrl ?? undefined,
    songUrl: track?.external_urls?.spotify ?? undefined,
  };
}

/**
 * Exchange the long-lived Spotify refresh token for a short-lived access token.
 *
 * This is Spotify's OAuth refresh-token flow: the client id/secret and refresh
 * token stay inside the Worker, while the temporary bearer token is used only
 * for server-to-Spotify requests.
 */
async function getAccessToken(env: Env): Promise<string> {
  const now = Date.now();
  // Refresh a few seconds early so a token does not expire mid-request.
  if (cachedToken && cachedToken.expiresAt > now + 5000) {
    return cachedToken.value;
  }

  // Spotify expects the app credentials as HTTP Basic auth, with the user's
  // refresh token in the form body.
  const basic = btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`);
  const res = await fetchWithTimeout(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: env.SPOTIFY_REFRESH_TOKEN,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const data: any = await res.json();
  const expiresInMs = (Number(data.expires_in) || 3600) * 1000;
  cachedToken = { value: data.access_token, expiresAt: now + expiresInMs };
  return cachedToken.value;
}

/**
 * GET a Spotify endpoint with the bearer token.
 *
 * Network/timeout errors become `null`; callers then fall back to the same
 * non-playing/empty payload instead of exposing an upstream failure.
 */
async function spotifyFetch(url: string, token: string): Promise<Response | null> {
  try {
    return await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return null;
  }
}

/**
 * fetch() with an AbortController timeout so upstream stalls cannot hang us.
 *
 * AbortController is the web-standard way to cancel a fetch: when the timer
 * fires, the signal aborts the request and Spotify handling falls back safely.
 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Parse the configured allowlist into an array of origins. */
function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Decide whether a request may read the data. Browser requests carry an Origin
 * (cross-origin) or a Referer (same-origin) we can check against the allowlist.
 * Requests with neither (e.g. curl, uptime checks) are allowed — they can't be
 * used to exfiltrate anything a visitor couldn't already see. Localhost origins
 * are always allowed so `npm run dev` works without editing the allowlist.
 */
function isRequestAllowed(origin: string | null, request: Request, env: Env): boolean {
  const list = allowedOrigins(env);

  if (origin) return isOriginAllowed(origin, list);

  const referer = request.headers.get('Referer');
  if (referer) {
    try {
      return isOriginAllowed(new URL(referer).origin, list);
    } catch {
      return false;
    }
  }

  // No Origin and no Referer — not a browser cross-site read.
  return true;
}

/**
 * Pure allow check for a concrete origin. True when the origin is on the
 * configured allowlist, when the allowlist is empty (unconfigured), or when it
 * is a localhost/loopback origin (local development). Exported for testing.
 */
export function isOriginAllowed(origin: string, allowed: string[]): boolean {
  if (isLocalOrigin(origin)) return true;
  if (allowed.length === 0) return true; // Not configured — don't hard-block.
  return allowed.includes(origin);
}

/** True for localhost, loopback, and the LAN dev host on any port. */
export function isLocalOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return (host === 'localhost' ||
            host === '127.0.0.1' ||
            host === '192.168.0.168' ||
            host === '::1' ||
            host === '[::1]');
  } catch {
    return false;
  }
}

/**
 * Pick the Access-Control-Allow-Origin value to echo back.
 *
 * Browsers only expose the response when this header matches the request's
 * Origin. Non-browser callers may have no Origin, so we fall back to configured
 * origin (or `*` when unconfigured).
 */
function resolveAllowedOrigin(origin: string | null, request: Request, env: Env): string {
  const list = allowedOrigins(env);
  if (origin && isOriginAllowed(origin, list)) return origin;
  if (list.length > 0) return list[0];
  return origin ?? '*';
}

/**
 * Build CORS response headers for browser reads.
 *
 * `Vary: Origin` tells shared caches that responses can differ by caller origin,
 * preventing one allowed site's CORS header from being reused for another.
 */
function buildCorsHeaders(allowOrigin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

/**
 * Clone a (possibly cached) response and attach request-specific CORS headers.
 *
 * Cached bodies are shared across visitors, but the allowed origin can vary per
 * request, so CORS is applied after cache lookup.
 */
function withCors(response: Response, corsHeaders: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Serialize a payload as JSON with the status and headers chosen by the caller. */
function json(
  data: unknown,
  init: { status: number; headers?: Record<string, string> },
): Response {
  return new Response(JSON.stringify(data), {
    status: init.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(init.headers ?? {}) },
  });
}
