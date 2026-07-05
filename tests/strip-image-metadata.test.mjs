/**
 * strip-image-metadata.test.mjs — Metadata-scrubbing image pipeline tests.
 *
 * The sync pipeline strips EXIF before images are published, but phone photos can
 * store rotation as metadata rather than pixels. These tests guard both halves of
 * that contract: orientation must be baked into the image before metadata is
 * removed, and already-clean files should not be re-encoded unnecessarily.
 *
 * Each test builds a tiny image fixture with sharp, runs the script under test,
 * then inspects the resulting file. The `try/finally` blocks keep fixture cleanup
 * separate from the assertions so failures do not leave test artifacts behind.
 */
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
      // Arrange: create a real JPEG fixture so sharp writes an actual EXIF
      // orientation tag, matching the kind of file the sync script receives.
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

      // Act: run the same exported helper the content sync pipeline calls.
      const result = await stripImageMetadata(dir);
      expect(result.stripped).toBe(1);

      const output = await sharp(readFileSync(file)).metadata();
      // Assert: pixels now carry the orientation, and metadata no longer does.
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
      // Clean PNG fixture: no EXIF means the safest behavior is to do nothing.
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
