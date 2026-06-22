import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import remarkObsidianEmbeds from '../src/plugins/remark-obsidian-embeds.mjs';
import { syncObsidianAssets } from '../scripts/sync-obsidian-assets.mjs';

describe('Obsidian embed rendering', () => {
  it('renders a standalone Excalidraw embed as an image with dimensions', () => {
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

    remarkObsidianEmbeds()(tree);

    expect(tree.children[0]).toEqual({
      type: 'html',
      value:
        '<img src="/obsidian-assets/Excalidraw/stage-mixer-diagram.svg" alt="stage mixer diagram" width="800" height="600" loading="lazy" decoding="async" />',
    });
  });

  it('uses an existing PNG export when no SVG export is present', () => {
    const assetsDir = mkdtempSync(join(tmpdir(), 'obsidian-assets-'));

    try {
      writeFileSync(join(assetsDir, 'stage-mixer-view-front.png'), 'png');

      const tree = {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', value: '![[stage-mixer-view-front.excalidraw|600x400]]' }],
          },
        ],
      };

      remarkObsidianEmbeds({ assetsDir })(tree);

      expect(tree.children[0].value).toContain('src="/obsidian-assets/stage-mixer-view-front.png"');
      expect(tree.children[0].value).toContain('width="600"');
      expect(tree.children[0].value).toContain('height="400"');
    } finally {
      rmSync(assetsDir, { recursive: true, force: true });
    }
  });
});

describe('Obsidian asset sync', () => {
  it('copies only renderable assets referenced by Obsidian embeds', () => {
    const root = mkdtempSync(join(tmpdir(), 'obsidian-sync-'));
    const vaultDir = join(root, 'vault');
    const contentDir = join(root, 'content');
    const assetsDir = join(root, 'public', 'obsidian-assets');

    try {
      mkdirSync(vaultDir, { recursive: true });
      mkdirSync(contentDir, { recursive: true });

      writeFileSync(join(vaultDir, 'stage-mixer-view-front.svg'), '<svg />', { flag: 'wx' });
      writeFileSync(join(vaultDir, 'stage-mixer-view-front.excalidraw'), 'raw drawing', { flag: 'wx' });
      writeFileSync(join(vaultDir, 'stage-photo.jpg'), 'jpg', { flag: 'wx' });
      writeFileSync(
        join(contentDir, 'stage-mixer.md'),
        [
          '![[stage-mixer-view-front.excalidraw|600x400]]',
          '![[stage-photo.jpg|Front photo]]',
          '![[missing-diagram.excalidraw|Missing]]',
        ].join('\n\n'),
        { flag: 'wx' },
      );

      const result = syncObsidianAssets({ vaultDir, contentDirs: [contentDir], assetsDir });

      expect(result.copied).toBe(2);
      expect(result.missing).toEqual(['missing-diagram.excalidraw']);
      expect(existsSync(join(assetsDir, 'stage-mixer-view-front.svg'))).toBe(true);
      expect(existsSync(join(assetsDir, 'stage-photo.jpg'))).toBe(true);
      expect(existsSync(join(assetsDir, 'stage-mixer-view-front.excalidraw'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('copies Excalidraw exports from a shared vault Excalidraw folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'obsidian-shared-excalidraw-'));
    const websiteVaultDir = join(root, 'Projects', 'Website');
    const sharedExcalidrawDir = join(root, 'Excalidraw');
    const contentDir = join(root, 'content');
    const assetsDir = join(root, 'public', 'obsidian-assets');

    try {
      mkdirSync(websiteVaultDir, { recursive: true });
      mkdirSync(sharedExcalidrawDir, { recursive: true });
      mkdirSync(contentDir, { recursive: true });

      writeFileSync(join(sharedExcalidrawDir, 'stage-mixer-diagram.svg'), '<svg />', { flag: 'wx' });
      writeFileSync(
        join(contentDir, 'stage-mixer.md'),
        '![[Excalidraw/stage-mixer-diagram.excalidraw|stage-mixer-diagram|800x600]]',
        { flag: 'wx' },
      );

      const result = syncObsidianAssets({
        vaultDir: websiteVaultDir,
        assetSearchDirs: [websiteVaultDir, sharedExcalidrawDir],
        contentDirs: [contentDir],
        assetsDir,
      });

      expect(result.copied).toBe(1);
      expect(result.missing).toEqual([]);
      expect(existsSync(join(assetsDir, 'Excalidraw', 'stage-mixer-diagram.svg'))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
