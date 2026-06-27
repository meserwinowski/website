import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { stripImageMetadata } from '../scripts/strip-image-metadata.mjs';

describe('strip-image-metadata orientation handling', () => {
  it('bakes EXIF orientation into the pixels before stripping metadata', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'strip-orient-'));

    try {
      // A landscape 100x50 image tagged orientation 6 ("rotate 90° CW to
      // display"), i.e. it should render as a 50x100 portrait. Stripping the
      // EXIF without rotating would leave it visibly rotated.
      const tagged = await sharp({
        create: { width: 100, height: 50, channels: 3, background: { r: 200, g: 50, b: 50 } },
      })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer();

      const file = join(dir, 'photo.jpg');
      writeFileSync(file, tagged);

      const result = await stripImageMetadata(dir);
      expect(result.stripped).toBe(1);

      const output = await sharp(readFileSync(file)).metadata();
      // Rotation is baked into the pixels (dimensions swapped to portrait)...
      expect(output.width).toBe(50);
      expect(output.height).toBe(100);
      // ...and the now-redundant orientation tag and EXIF are gone.
      expect(output.orientation).toBeUndefined();
      expect(output.exif).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves an already-clean image untouched', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'strip-clean-'));

    try {
      const clean = await sharp({
        create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 120, b: 200 } },
      })
        .png()
        .toBuffer();

      const file = join(dir, 'clean.png');
      writeFileSync(file, clean);

      const result = await stripImageMetadata(dir);
      expect(result.stripped).toBe(0);

      // Byte-for-byte unchanged: no needless re-encode.
      expect(readFileSync(file).equals(clean)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
