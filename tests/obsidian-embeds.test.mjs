/**
 * obsidian-embeds.test.mjs — Unit tests for Obsidian image/embed handling.
 *
 * Obsidian embeds (`![[...]]`) are resolved at build time by a remark plugin and
 * a companion asset-sync script. This suite protects that pipeline: project
 * scoped image URLs, Excalidraw export selection, HEIC → WebP naming, intrinsic
 * dimensions, blur-up placeholders, first-image loading priority, and incremental
 * asset copying.
 *
 * The tests use small AST and filesystem fixtures instead of running a full
 * Astro build. `describe` separates plugin rendering from asset syncing, `it`
 * names the behavior being guarded, and `expect` checks the public output the
 * generated HTML or synced asset tree must preserve.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import remarkObsidianEmbeds from '../src/plugins/remark-obsidian-embeds.mjs';
import { syncObsidianAssets } from '../scripts/sync-obsidian-assets.mjs';

// The plugin derives a per-project asset folder from the content file's slug,
// so embeds land in /assets/<slug>/ rather than the shared root. These
// constants are fixtures that pretend the content file lives at
// projects/stage-mixer.md without needing the real vault.
const contentRoot = '/repo/src/content';
const stageMixerFile = { path: '/repo/src/content/projects/stage-mixer.md' };
const stageMixerPrefix = 'stage-mixer';

describe('Obsidian embed rendering', () => {
  it('renders a standalone Excalidraw embed under the project folder', async () => {
    // Arrange: a minimal mdast paragraph whose only text is an Obsidian embed.
    // Act happens when the async remark plugin mutates `tree` in place.
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              value: '![[Excalidraw/stage-mixer-diagram.excalidraw|stage-mixer-diagram.excalidraw|800x600]]',
            },
          ],
        },
      ],
    };

    await remarkObsidianEmbeds({ contentRoot })(tree, stageMixerFile);

    expect(tree.children[0]).toEqual({
      type: 'html',
      value:
        '<img src="/assets/stage-mixer/stage-mixer-diagram.svg" alt="stage mixer diagram" width="800" height="600" loading="eager" fetchpriority="high" decoding="async" />',
    });
  });

  it('uses an existing PNG export under the project folder when no SVG export is present', async () => {
    const assetsDir = mkdtempSync(join(tmpdir(), 'obsidian-assets-'));

    try {
      // Fixture asset: only a PNG export exists, so the plugin should pick it
      // rather than assuming every Excalidraw drawing has an SVG sibling.
      mkdirSync(join(assetsDir, stageMixerPrefix), { recursive: true });
      writeFileSync(join(assetsDir, stageMixerPrefix, 'stage-mixer-view-front.png'), 'png');

      const tree = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', value: '![[stage-mixer-view-front.excalidraw|600x400]]' }],
          },
        ],
      };

      await remarkObsidianEmbeds({ assetsDir, contentRoot })(tree, stageMixerFile);

      expect(tree.children[0].value).toContain('src="/assets/stage-mixer/stage-mixer-view-front.png"');
      expect(tree.children[0].value).toContain('width="600"');
      expect(tree.children[0].value).toContain('height="400"');
    } finally {
      rmSync(assetsDir, { recursive: true, force: true });
    }
  });

  it('rewrites a HEIC embed to its converted WebP asset under the project folder', async () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: '![[whiteboard.HEIC]]' }],
        },
      ],
    };

    await remarkObsidianEmbeds({ contentRoot })(tree, stageMixerFile);

    expect(tree.children[0]).toEqual({
      type: 'html',
      value:
        '<img src="/assets/stage-mixer/whiteboard.webp" alt="whiteboard" loading="eager" fetchpriority="high" decoding="async" />',
    });
  });

  it('falls back to the shared root when no contentRoot context is available', async () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: '![[whiteboard.HEIC]]' }],
        },
      ],
    };

    await remarkObsidianEmbeds()(tree);

    expect(tree.children[0]).toEqual({
      type: 'html',
      value: '<img src="/assets/whiteboard.webp" alt="whiteboard" loading="eager" fetchpriority="high" decoding="async" />',
    });
  });

  it('stamps intrinsic width/height from the image when the embed omits dimensions', async () => {
    const assetsDir = mkdtempSync(join(tmpdir(), 'obsidian-dims-'));

    try {
      // A tiny real WebP lets sharp read metadata, proving dimensions come from
      // the image file when the markdown embed omits an explicit `800x600`.
      mkdirSync(join(assetsDir, stageMixerPrefix), { recursive: true });
      const webp = await sharp({
        create: { width: 320, height: 240, channels: 3, background: { r: 1, g: 2, b: 3 } },
      })
        .webp()
        .toBuffer();
      writeFileSync(join(assetsDir, stageMixerPrefix, 'mixer.webp'), webp);

      const tree = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', value: '![[mixer.webp]]' }],
          },
        ],
      };

      await remarkObsidianEmbeds({ assetsDir, contentRoot })(tree, stageMixerFile);

      const { value } = tree.children[0];
      expect(tree.children[0].type).toBe('html');
      expect(value).toContain('src="/assets/stage-mixer/mixer.webp"');
      expect(value).toContain('alt="mixer"');
      expect(value).toContain('width="320"');
      expect(value).toContain('height="240"');
      // First (and only) image on the page loads eagerly as the likely LCP element.
      expect(value).toContain('loading="eager"');
      expect(value).toContain('fetchpriority="high"');
      // Blur-up placeholder is inlined as a WebP data URI background.
      expect(value).toContain('style="background-image:url(data:image/webp;base64,');
    } finally {
      rmSync(assetsDir, { recursive: true, force: true });
    }
  });

  it('loads the first embedded image eagerly and later images lazily', async () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: '![[whiteboard.HEIC|first]]' }],
        },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: '![[mixer.HEIC|second]]' }],
        },
      ],
    };

    await remarkObsidianEmbeds({ contentRoot })(tree, stageMixerFile);

    const first = tree.children[0].value;
    const second = tree.children[1].value;

    expect(first).toContain('loading="eager"');
    expect(first).toContain('fetchpriority="high"');
    expect(second).toContain('loading="lazy"');
    expect(second).not.toContain('fetchpriority');
  });
});

describe('Obsidian asset sync', () => {
  it('copies only renderable embeds, grouped under the project folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'obsidian-sync-'));
    const vaultDir = join(root, 'vault');
    const contentDir = join(root, 'content');
    const projectsDir = join(contentDir, 'projects');
    const assetsDir = join(root, 'public', 'obsidian-assets');

    try {
      // This fake vault includes a renderable SVG export, a raw Excalidraw file,
      // a normal image, and one missing reference so each sync branch is visible.
      mkdirSync(vaultDir, { recursive: true });
      mkdirSync(projectsDir, { recursive: true });

      writeFileSync(join(vaultDir, 'stage-mixer-view-front.svg'), '<svg />', { flag: 'wx' });
      writeFileSync(join(vaultDir, 'stage-mixer-view-front.excalidraw'), 'raw drawing', { flag: 'wx' });
      writeFileSync(join(vaultDir, 'stage-photo.jpg'), 'jpg', { flag: 'wx' });
      writeFileSync(
        join(projectsDir, 'stage-mixer.md'),
        [
          '![[stage-mixer-view-front.excalidraw|600x400]]',
          '![[stage-photo.jpg|Front photo]]',
          '![[missing-diagram.excalidraw|Missing]]',
        ].join('\n\n'),
        { flag: 'wx' },
      );

      const result = syncObsidianAssets({
        vaultDir,
        contentDirs: [projectsDir],
        contentRoot: contentDir,
        assetsDir,
      });

      expect(result.copied).toBe(2);
      expect(result.missing).toEqual(['missing-diagram.excalidraw']);
      expect(existsSync(join(assetsDir, 'stage-mixer', 'stage-mixer-view-front.svg'))).toBe(true);
      expect(existsSync(join(assetsDir, 'stage-mixer', 'stage-photo.jpg'))).toBe(true);
      // Nothing is written to the shared root any more.
      expect(existsSync(join(assetsDir, 'stage-photo.jpg'))).toBe(false);
      expect(existsSync(join(assetsDir, 'stage-mixer', 'stage-mixer-view-front.excalidraw'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('copies Excalidraw exports from a shared vault Excalidraw folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'obsidian-shared-excalidraw-'));
    const websiteVaultDir = join(root, 'Projects', 'Website');
    const sharedExcalidrawDir = join(root, 'Excalidraw');
    const contentDir = join(root, 'content');
    const projectsDir = join(contentDir, 'projects');
    const assetsDir = join(root, 'public', 'obsidian-assets');

    try {
      mkdirSync(websiteVaultDir, { recursive: true });
      mkdirSync(sharedExcalidrawDir, { recursive: true });
      mkdirSync(projectsDir, { recursive: true });

      writeFileSync(join(sharedExcalidrawDir, 'stage-mixer-diagram.svg'), '<svg />', { flag: 'wx' });
      writeFileSync(
        join(projectsDir, 'stage-mixer.md'),
        '![[Excalidraw/stage-mixer-diagram.excalidraw|stage-mixer-diagram|800x600]]',
        { flag: 'wx' },
      );

      const result = syncObsidianAssets({
        vaultDir: websiteVaultDir,
        assetSearchDirs: [websiteVaultDir, sharedExcalidrawDir],
        contentDirs: [projectsDir],
        contentRoot: contentDir,
        assetsDir,
      });

      expect(result.copied).toBe(1);
      expect(result.missing).toEqual([]);
      // The Excalidraw/ prefix is dropped; the export lands in the project folder.
      expect(existsSync(join(assetsDir, 'stage-mixer', 'stage-mixer-diagram.svg'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('copies HEIC sources and tracks the converted WebP under the project folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'obsidian-heic-'));
    const vaultDir = join(root, 'vault');
    const contentDir = join(root, 'content');
    const projectsDir = join(contentDir, 'projects');
    const assetsDir = join(root, 'public', 'obsidian-assets');

    try {
      mkdirSync(join(vaultDir, 'images', 'projects'), { recursive: true });
      mkdirSync(projectsDir, { recursive: true });

      writeFileSync(join(vaultDir, 'images', 'projects', 'whiteboard.HEIC'), 'heic-bytes', { flag: 'wx' });
      writeFileSync(join(projectsDir, 'stage-mixer.md'), '![[whiteboard.HEIC]]', { flag: 'wx' });

      const result = syncObsidianAssets({
        vaultDir,
        contentDirs: [projectsDir],
        contentRoot: contentDir,
        assetsDir,
      });

      expect(result.missing).toEqual([]);
      expect(result.synced).toContain('stage-mixer/whiteboard.webp');
      // The raw HEIC is copied so the metadata strip step can convert it to WebP.
      expect(existsSync(join(assetsDir, 'stage-mixer', 'whiteboard.HEIC'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('skips assets whose published output is already up to date', () => {
    const root = mkdtempSync(join(tmpdir(), 'obsidian-incremental-'));
    const vaultDir = join(root, 'vault');
    const contentDir = join(root, 'content');
    const pagesDir = join(contentDir, 'pages');
    const assetsDir = join(root, 'public', 'obsidian-assets');

    try {
      mkdirSync(vaultDir, { recursive: true });
      mkdirSync(pagesDir, { recursive: true });
      mkdirSync(join(assetsDir, 'about'), { recursive: true });

      writeFileSync(join(vaultDir, 'stage-photo.jpg'), 'source', { flag: 'wx' });
      writeFileSync(join(pagesDir, 'about.md'), '![[stage-photo.jpg]]', { flag: 'wx' });

      // Pre-existing published output, marked newer than the source.
      const output = join(assetsDir, 'about', 'stage-photo.jpg');
      writeFileSync(output, 'already-published');
      // Newer output models an incremental sync where the published asset should
      // be trusted and left byte-for-byte alone.
      const future = new Date(Date.now() + 60_000);
      utimesSync(output, future, future);

      const result = syncObsidianAssets({
        vaultDir,
        contentDirs: [pagesDir],
        contentRoot: contentDir,
        assetsDir,
      });

      expect(result.upToDate).toBe(1);
      expect(result.copied).toBe(0);
      expect(result.synced).toContain('about/stage-photo.jpg');
      // The output is left untouched (not re-copied from the source).
      expect(readFileSync(output, 'utf-8')).toBe('already-published');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
