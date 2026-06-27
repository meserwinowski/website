import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import remarkObsidianEmbeds from '../src/plugins/remark-obsidian-embeds.mjs';
import { syncObsidianAssets } from '../scripts/sync-obsidian-assets.mjs';

// The plugin derives a per-project asset folder from the content file's path
// relative to contentRoot, so embeds land in /images/<project>/ rather than the
// shared root. These fixtures put the file at projects/stage-mixer.md.
const contentRoot = '/repo/src/content';
const stageMixerFile = { path: '/repo/src/content/projects/stage-mixer.md' };
const stageMixerPrefix = 'projects/stage-mixer';

describe('Obsidian embed rendering', () => {
  it('renders a standalone Excalidraw embed under the project folder', async () => {
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
        '<img src="/images/projects/stage-mixer/stage-mixer-diagram.svg" alt="stage mixer diagram" width="800" height="600" loading="lazy" decoding="async" />',
    });
  });

  it('uses an existing PNG export under the project folder when no SVG export is present', async () => {
    const assetsDir = mkdtempSync(join(tmpdir(), 'obsidian-assets-'));

    try {
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

      expect(tree.children[0].value).toContain('src="/images/projects/stage-mixer/stage-mixer-view-front.png"');
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
        '<img src="/images/projects/stage-mixer/whiteboard.webp" alt="whiteboard" loading="lazy" decoding="async" />',
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
      value: '<img src="/images/whiteboard.webp" alt="whiteboard" loading="lazy" decoding="async" />',
    });
  });

  it('stamps intrinsic width/height from the image when the embed omits dimensions', async () => {
    const assetsDir = mkdtempSync(join(tmpdir(), 'obsidian-dims-'));

    try {
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

      expect(tree.children[0]).toEqual({
        type: 'html',
        value:
          '<img src="/images/projects/stage-mixer/mixer.webp" alt="mixer" width="320" height="240" loading="lazy" decoding="async" />',
      });
    } finally {
      rmSync(assetsDir, { recursive: true, force: true });
    }
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
      expect(existsSync(join(assetsDir, 'projects', 'stage-mixer', 'stage-mixer-view-front.svg'))).toBe(true);
      expect(existsSync(join(assetsDir, 'projects', 'stage-mixer', 'stage-photo.jpg'))).toBe(true);
      // Nothing is written to the shared root any more.
      expect(existsSync(join(assetsDir, 'stage-photo.jpg'))).toBe(false);
      expect(existsSync(join(assetsDir, 'projects', 'stage-mixer', 'stage-mixer-view-front.excalidraw'))).toBe(false);
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
      expect(existsSync(join(assetsDir, 'projects', 'stage-mixer', 'stage-mixer-diagram.svg'))).toBe(true);
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
      expect(result.synced).toContain('projects/stage-mixer/whiteboard.webp');
      // The raw HEIC is copied so the metadata strip step can convert it to WebP.
      expect(existsSync(join(assetsDir, 'projects', 'stage-mixer', 'whiteboard.HEIC'))).toBe(true);
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
      mkdirSync(join(assetsDir, 'pages', 'about'), { recursive: true });

      writeFileSync(join(vaultDir, 'stage-photo.jpg'), 'source', { flag: 'wx' });
      writeFileSync(join(pagesDir, 'about.md'), '![[stage-photo.jpg]]', { flag: 'wx' });

      // Pre-existing published output, marked newer than the source.
      const output = join(assetsDir, 'pages', 'about', 'stage-photo.jpg');
      writeFileSync(output, 'already-published');
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
      expect(result.synced).toContain('pages/about/stage-photo.jpg');
      // The output is left untouched (not re-copied from the source).
      expect(readFileSync(output, 'utf-8')).toBe('already-published');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
