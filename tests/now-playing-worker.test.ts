/**
 * Unit tests for the Cloudflare Worker's pure data-shaping function.
 *
 * These test the transform from raw Spotify API bodies to the minimal public
 * payload without any network access or Workers runtime. Covers the three
 * branches the widget relies on: actively playing, recently played (fallback),
 * and the empty/nothing states.
 */
import { describe, it, expect } from 'vitest';
import { shapeNowPlaying, isOriginAllowed, isLocalOrigin } from '../worker/src/index';

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

describe('origin allowlist', () => {
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
