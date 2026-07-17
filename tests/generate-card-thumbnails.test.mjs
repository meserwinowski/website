/**
 * generate-card-thumbnails.test.mjs — Tests for the card-thumbnail generator.
 *
 * The build emits small, 16:9 WebP derivatives + a manifest for each project
 * card thumbnail so cards don't download the full-size synced asset. These tests
 * build a tiny project + asset tree in a temp dir, run the exported generator,
 * and inspect the derivatives and manifest it writes. `try/finally` keeps fixture
 * cleanup separate from the assertions so a failure never leaks test artifacts.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { generateCardThumbnails } from '../scripts/generate-card-thumbnails.mjs';

let root;
let contentDir;
let assetsDir;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'card-thumbs-'));
  contentDir = join(root, 'content', 'projects');
  assetsDir = join(root, 'assets');
  mkdirSync(contentDir, { recursive: true });
  mkdirSync(assetsDir, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write a minimal project markdown file carrying a `thumbnail` frontmatter. */
function writeProject(name, thumbnail) {
  writeFileSync(join(contentDir, `${name}.md`), `---\ntitle: ${name}\nthumbnail: ${thumbnail}\n---\n\nBody.\n`);
}

/** Write a raster fixture image to a path under the temp assets dir. */
async function writeImage(relativePath, { width, height, format = 'png' }) {
  const filePath = join(assetsDir, relativePath);
  mkdirSync(join(filePath, '..'), { recursive: true });
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 60, b: 30 } },
  })[format]().toBuffer();
  writeFileSync(filePath, buffer);
  return filePath;
}

describe('generate-card-thumbnails', () => {
  it('emits 16:9 WebP derivatives and a manifest entry for a raster thumbnail', async () => {
    // A portrait source exercises the center-crop to the card's 16:9 box.
    await writeImage('proj/cover.png', { width: 1200, height: 1600 });
    writeProject('proj', '/assets/proj/cover.png');

    const result = await generateCardThumbnails({ contentDir, assetsDir, widths: [400, 800] });

    expect(result.generated).toBe(2);
    const small = join(assetsDir, 'proj', 'cover-card-400.webp');
    const large = join(assetsDir, 'proj', 'cover-card-800.webp');
    expect(existsSync(small)).toBe(true);
    expect(existsSync(large)).toBe(true);

    // Derivatives are cropped to 16:9 at the requested widths.
    const smallMeta = await sharp(readFileSync(small)).metadata();
    expect(smallMeta.format).toBe('webp');
    expect(smallMeta.width).toBe(400);
    expect(smallMeta.height).toBe(225);
    const largeMeta = await sharp(readFileSync(large)).metadata();
    expect(largeMeta.width).toBe(800);
    expect(largeMeta.height).toBe(450);

    const entry = result.manifest['/assets/proj/cover.png'];
    expect(entry).toBeDefined();
    expect(entry.src).toBe('/assets/proj/cover-card-400.webp');
    expect(entry.srcset).toBe(
      '/assets/proj/cover-card-400.webp 400w, /assets/proj/cover-card-800.webp 800w',
    );
    expect(entry.width).toBe(800);
    expect(entry.height).toBe(450);
    expect(entry.lqip).toMatch(/^data:image\/webp;base64,/);

    // The manifest is written to disk for the resolver to read at build time.
    expect(existsSync(join(assetsDir, '.card-thumbnails.json'))).toBe(true);
  });

  it('skips SVG, external, and missing thumbnails (they fall back to the raw path)', async () => {
    await writeImage('logo.svg', { width: 100, height: 100 }); // written as PNG bytes, but .svg ext
    writeFileSync(join(assetsDir, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    writeProject('vector', '/assets/logo.svg');
    writeProject('external', 'https://example.com/cover.png');
    writeProject('legacy', '/images/projects/cover.svg');
    writeProject('gone', '/assets/gone/missing.png');

    const result = await generateCardThumbnails({ contentDir, assetsDir, widths: [400, 800] });

    expect(result.manifest).toEqual({});
    expect(result.generated).toBe(0);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        '/assets/logo.svg',
        'https://example.com/cover.png',
        '/images/projects/cover.svg',
        '/assets/gone/missing.png',
      ]),
    );
  });

  it('is idempotent: a second run reuses up-to-date derivatives', async () => {
    await writeImage('proj/cover.png', { width: 1000, height: 800 });
    writeProject('proj', '/assets/proj/cover.png');

    await generateCardThumbnails({ contentDir, assetsDir, widths: [400, 800] });
    const second = await generateCardThumbnails({ contentDir, assetsDir, widths: [400, 800] });

    expect(second.generated).toBe(0);
    expect(second.upToDate).toBe(2);
  });

  it('removes stale derivatives it no longer owns', async () => {
    await writeImage('proj/cover.png', { width: 1000, height: 800 });
    writeProject('proj', '/assets/proj/cover.png');

    // A leftover derivative from a previous name should be cleaned up.
    writeFileSync(join(assetsDir, 'proj', 'old-card-400.webp'), 'stale');

    const result = await generateCardThumbnails({ contentDir, assetsDir, widths: [400, 800] });

    expect(existsSync(join(assetsDir, 'proj', 'old-card-400.webp'))).toBe(false);
    expect(result.removed).toBe(1);
  });
});
