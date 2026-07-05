/**
 * now-playing-worker.test.ts — Cloudflare Worker helper contract tests.
 *
 * The Worker sits between the public site and Spotify. These tests cover the
 * pure helpers exported from `worker/src/index.ts`: shaping Spotify responses
 * into the tiny JSON payload the widgets render, and deciding which origins get
 * CORS access. Keeping this layer deterministic means malformed Spotify bodies
 * fail closed to empty UI states instead of leaking exceptions to visitors.
 *
 * No fetch mock is needed here because the suite passes small JSON fixtures
 * directly to the helper functions. In Vitest terms, `describe` groups each
 * branch of behavior, `it` names a concrete scenario, and `expect` checks the
 * public contract the Worker promises to the frontend.
 */
import { describe, it, expect } from 'vitest';
import {
  shapeNowPlaying,
  shapeLikedSongs,
  isOriginAllowed,
  isLocalOrigin,
} from '../worker/src/index';

// Shared Spotify-track fixture: enough fields to prove the Worker preserves
// reader-facing data while dropping the large, private API response shape.
const track = {
  name: 'Song Title',
  artists: [{ name: 'Artist One' }, { name: 'Artist Two' }],
  album: {
    name: 'Album Name',
    images: [
      { url: 'https://i.scdn.co/image/large' },
      { url: 'https://i.scdn.co/image/small' },
    ],
  },
  external_urls: { spotify: 'https://open.spotify.com/track/abc' },
};

describe('shapeNowPlaying — currently playing', () => {
  it('shapes an actively playing track', () => {
    // Arrange with a Spotify-like body, act by shaping it, then assert the exact
    // public JSON the site consumes. That arrange-act-assert rhythm repeats below.
    const result = shapeNowPlaying({ is_playing: true, item: track }, 'current');
    expect(result).toEqual({
      isPlaying: true,
      title: 'Song Title',
      artist: 'Artist One, Artist Two',
      album: 'Album Name',
      albumImageUrl: 'https://i.scdn.co/image/large',
      songUrl: 'https://open.spotify.com/track/abc',
    });
  });

  it('treats is_playing=false as not playing (caller will fall back)', () => {
    expect(shapeNowPlaying({ is_playing: false, item: track }, 'current')).toEqual({
      isPlaying: false,
    });
  });

  it('treats a missing item as not playing', () => {
    expect(shapeNowPlaying({ is_playing: true, item: null }, 'current')).toEqual({
      isPlaying: false,
    });
  });
});

describe('shapeNowPlaying — recently played', () => {
  it('shapes the most recent history entry with playedAt', () => {
    // Recently-played data is the fallback when nothing is active, so `isPlaying`
    // intentionally stays false while still carrying track metadata.
    const body = {
      items: [{ track, played_at: '2026-01-01T00:00:00Z' }],
    };
    const result = shapeNowPlaying(body, 'recent');
    expect(result).toEqual({
      isPlaying: false,
      title: 'Song Title',
      artist: 'Artist One, Artist Two',
      album: 'Album Name',
      albumImageUrl: 'https://i.scdn.co/image/large',
      songUrl: 'https://open.spotify.com/track/abc',
      playedAt: '2026-01-01T00:00:00Z',
    });
  });

  it('omits playedAt when absent', () => {
    const result = shapeNowPlaying({ items: [{ track }] }, 'recent');
    expect(result.isPlaying).toBe(false);
    expect(result.title).toBe('Song Title');
    expect(result).not.toHaveProperty('playedAt');
  });

  it('returns not-playing for an empty history', () => {
    expect(shapeNowPlaying({ items: [] }, 'recent')).toEqual({ isPlaying: false });
  });
});

describe('shapeNowPlaying — resilience', () => {
  it('handles null / non-object bodies', () => {
    // The Worker receives third-party API data; defensive parsing keeps bad or
    // unexpected responses from becoming runtime errors.
    expect(shapeNowPlaying(null, 'current')).toEqual({ isPlaying: false });
    expect(shapeNowPlaying(undefined, 'recent')).toEqual({ isPlaying: false });
    expect(shapeNowPlaying('nope' as unknown, 'current')).toEqual({ isPlaying: false });
  });

  it('handles a track with no album art', () => {
    const bare = { name: 'Bare', artists: [{ name: 'Solo' }], album: { name: 'A', images: [] } };
    const result = shapeNowPlaying({ is_playing: true, item: bare }, 'current');
    expect(result.isPlaying).toBe(true);
    expect(result.title).toBe('Bare');
    expect(result.artist).toBe('Solo');
    expect(result.albumImageUrl).toBeUndefined();
  });
});

describe('shapeLikedSongs — saved tracks list', () => {
  // A list fixture exercises ordering, repeated field extraction, and optional
  // `added_at` metadata without making a real Spotify request.
  const savedBody = {
    items: [
      { added_at: '2026-02-01T00:00:00Z', track },
      {
        added_at: '2026-01-15T00:00:00Z',
        track: {
          name: 'Second Song',
          artists: [{ name: 'Solo' }],
          album: { name: 'Second Album', images: [{ url: 'https://i.scdn.co/image/two' }] },
          external_urls: { spotify: 'https://open.spotify.com/track/def' },
        },
      },
    ],
  };

  it('shapes saved tracks newest-first with addedAt', () => {
    const result = shapeLikedSongs(savedBody);
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[0]).toEqual({
      title: 'Song Title',
      artist: 'Artist One, Artist Two',
      album: 'Album Name',
      albumImageUrl: 'https://i.scdn.co/image/large',
      songUrl: 'https://open.spotify.com/track/abc',
      addedAt: '2026-02-01T00:00:00Z',
    });
    expect(result.tracks[1].title).toBe('Second Song');
    expect(result.tracks[1].addedAt).toBe('2026-01-15T00:00:00Z');
  });

  it('omits addedAt when absent', () => {
    const result = shapeLikedSongs({ items: [{ track }] });
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]).not.toHaveProperty('addedAt');
  });

  it('drops entries without a usable track', () => {
    const result = shapeLikedSongs({
      items: [{ added_at: 'x', track: null }, { added_at: 'y', track }, {}],
    });
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].title).toBe('Song Title');
  });

  it('returns an empty list for empty / malformed bodies', () => {
    expect(shapeLikedSongs({ items: [] })).toEqual({ tracks: [] });
    expect(shapeLikedSongs(null)).toEqual({ tracks: [] });
    expect(shapeLikedSongs(undefined)).toEqual({ tracks: [] });
    expect(shapeLikedSongs({ nope: true })).toEqual({ tracks: [] });
    expect(shapeLikedSongs('nope' as unknown)).toEqual({ tracks: [] });
  });
});

describe('origin allowlist', () => {
  // CORS decisions are security-sensitive but also need a local-dev escape hatch.
  const allowed = ['https://www.mattserwinowski.com', 'https://mattserwinowski.com'];

  it('allows configured production origins', () => {
    expect(isOriginAllowed('https://www.mattserwinowski.com', allowed)).toBe(true);
    expect(isOriginAllowed('https://mattserwinowski.com', allowed)).toBe(true);
  });

  it('rejects an unknown cross-site origin', () => {
    expect(isOriginAllowed('https://evil.example.com', allowed)).toBe(false);
  });

  it('always allows localhost / loopback origins (any port) for local dev', () => {
    expect(isOriginAllowed('http://localhost:4321', allowed)).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:4321', allowed)).toBe(true);
    expect(isOriginAllowed('http://localhost:3000', allowed)).toBe(true);
    expect(isLocalOrigin('http://localhost:4321')).toBe(true);
    expect(isLocalOrigin('http://127.0.0.1:8788')).toBe(true);
    expect(isLocalOrigin('https://www.mattserwinowski.com')).toBe(false);
  });

  it('does not hard-block when the allowlist is empty (unconfigured)', () => {
    expect(isOriginAllowed('https://anything.example', [])).toBe(true);
  });
});
