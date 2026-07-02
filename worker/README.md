# Spotify "Now Playing" Worker

A tiny [Cloudflare Worker](https://developers.cloudflare.com/workers/) that powers
the Spotify widgets on the site's About page. It holds the Spotify credentials,
refreshes the access token, and serves two public JSON endpoints:

- **`/now-playing`** — the track I'm currently playing, or (fallback) my most
  recently played track. Powers the **"What I'm listening to"** card.
- **`/liked-songs`** — my five most recently saved **"Liked Songs"**. Powers the
  **"Liked Songs"** card.

The static site fetches these endpoints **client-side, only on the About page**,
so they never block rendering and no secret ever reaches the browser.

```
Browser (About page)  ──▶  this Worker  ──▶  Spotify Web API
                              (holds the credentials, returns only track metadata)
```

## Response shapes

`GET /now-playing`:

```jsonc
{
  "isPlaying": true,
  "title": "Song name",
  "artist": "Artist 1, Artist 2",
  "album": "Album name",
  "albumImageUrl": "https://i.scdn.co/image/...",
  "songUrl": "https://open.spotify.com/track/...",
  "playedAt": "2026-01-01T00:00:00Z"   // only on the recently-played fallback
}
```

On any error (bad credentials, Spotify down, nothing ever played) it returns
HTTP 200 with `{ "isPlaying": false }`, and the widget simply hides itself.

`GET /liked-songs` (newest-saved first):

```jsonc
{
  "tracks": [
    {
      "title": "Song name",
      "artist": "Artist 1, Artist 2",
      "album": "Album name",
      "albumImageUrl": "https://i.scdn.co/image/...",
      "songUrl": "https://open.spotify.com/track/...",
      "addedAt": "2026-01-01T00:00:00Z"
    }
  ]
}
```

On any error / empty library it returns HTTP 200 with `{ "tracks": [] }`, and the
card hides itself.

## Required Spotify scopes

The refresh token must be minted with **all three** scopes (the token helper
requests them together):

- `user-read-currently-playing` — for `/now-playing` (live).
- `user-read-recently-played` — for `/now-playing` (fallback).
- `user-library-read` — for `/liked-songs`.

> **Adding a scope means re-authorizing.** Spotify only grants the scopes present
> at authorization time, so if you extend the scope list you must re-run the
> token helper (step 2) and update the `SPOTIFY_REFRESH_TOKEN` secret (step 4),
> then redeploy. The new token still covers the old scopes, so nothing breaks.

## Free-tier & abuse protection

Designed to stay comfortably on the **Cloudflare Workers free plan** (100k
requests/day, a hard cap with **no overage billing** — if exceeded, requests just
fail until midnight UTC and the widget hides). Layered protections:

1. **Edge caching** — each response is cached (`caches.default`; `max-age=60` for
   `/now-playing`, `max-age=300` for `/liked-songs`), so heavy traffic collapses
   to roughly one Spotify call per cache window.
2. **Cloudflare per-IP rate-limiting rule** — configured in the dashboard on the
   `api.` route (see setup step 6). Throttles abuse *before* the Worker runs.
3. **Origin/Referer allowlist + CORS** — only your site's origins can read it
   from a browser (`ALLOWED_ORIGIN` in `wrangler.toml`).
4. **Fast timeouts + fail-closed** — upstream stalls abort at 4s and return
   `{ isPlaying: false }`.
5. **Access-token memoization** — the access token is reused within the isolate.

## One-time setup

Everything below is done **once**. Run commands from the **repo root**.

### 1. Create a Spotify app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   and **Create app**.
2. In the app's **Settings**, add this exact **Redirect URI**:

   ```
   http://127.0.0.1:8888/callback
   ```

3. Copy the **Client ID** and **Client Secret**.

### 2. Generate a refresh token

```bash
npm run spotify:token -- --client-id=<CLIENT_ID> --client-secret=<CLIENT_SECRET>
```

This opens the Spotify consent page, catches the redirect on a throwaway
`127.0.0.1:8888` server, and prints your **refresh token**. (You can also omit the
flags and paste the values when prompted, or set `SPOTIFY_CLIENT_ID` /
`SPOTIFY_CLIENT_SECRET` in your environment.)

### 3. Authenticate wrangler

```bash
npx wrangler login
```

### 4. Store the three secrets in Cloudflare

Secrets live only in Cloudflare — never in git.

```bash
npx wrangler secret put SPOTIFY_CLIENT_ID     --config worker/wrangler.toml
npx wrangler secret put SPOTIFY_CLIENT_SECRET --config worker/wrangler.toml
npx wrangler secret put SPOTIFY_REFRESH_TOKEN --config worker/wrangler.toml
```

### 5. Point the route at your domain, then deploy

`worker/wrangler.toml` binds the Worker to a custom domain
(`api.mattserwinowski.com`). Your domain's DNS must be on Cloudflare — Cloudflare
creates the DNS record and TLS certificate automatically. Adjust the `pattern`
and `ALLOWED_ORIGIN` if your domain differs, then:

```bash
npm run worker:deploy
```

Verify it:

```bash
curl https://api.mattserwinowski.com/now-playing
curl https://api.mattserwinowski.com/liked-songs
```

### 6. Add the free per-IP rate-limiting rule

In the Cloudflare dashboard for your zone: **Security → WAF → Rate limiting rules
→ Create rule**. Suggested settings (the free plan allows one rule):

- **Field/path:** Hostname equals `api.mattserwinowski.com` (covers both
  `/now-playing` and `/liked-songs`)
- **Rate:** ~20 requests per **10 seconds**, counted **per IP**
- **Action:** Block (for the duration of the period)

### 7. Point the site at the Worker

The site reads the public Worker URLs from `PUBLIC_NOW_PLAYING_URL` and
`PUBLIC_LIKED_SONGS_URL` (in `deploy.env`), each falling back to the committed
default in `src/config.ts`. If your URLs match the defaults
(`https://api.mattserwinowski.com/now-playing` and `…/liked-songs`) there's
nothing to change; otherwise set them in `deploy.env` and rebuild.

## Local development

```bash
npm run worker:dev   # runs the Worker locally with wrangler dev
```

For local runs, provide the secrets via a git-ignored `worker/.dev.vars` file:

```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REFRESH_TOKEN=...
```

## Files

| Path | Purpose |
|------|---------|
| `worker/src/index.ts` | The Worker: path routing (`/now-playing`, `/liked-songs`), token refresh, currently-playing → recently-played fallback, saved-tracks list, caching, CORS/allowlist, timeouts. `shapeNowPlaying()` and `shapeLikedSongs()` are pure, unit-tested transforms. |
| `worker/wrangler.toml` | Worker config: route, `compatibility_date`, `ALLOWED_ORIGIN`. |
| `worker/tsconfig.json` | TypeScript config scoped to the Worker (Cloudflare types). |
| `scripts/spotify-refresh-token.mjs` | One-time OAuth helper to mint the refresh token. |
| `tests/now-playing-worker.test.ts` | Unit tests for `shapeNowPlaying()` and `shapeLikedSongs()`. |
