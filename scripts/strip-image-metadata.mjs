/**
 * strip-image-metadata.mjs — Make synced images safer and cheaper to ship.
 *
 * Public images come from an Obsidian vault, which may include phone photos
 * carrying EXIF/GPS metadata and large HEIC originals. This pass removes private
 * metadata from raster images, converts HEIC/HEIF to browser-friendly WebP, and
 * caps the longest edge so mobile browsers do less download and decode work.
 *
 * Node APIs used here:
 *  - `execFileSync` runs macOS `sips` as a child process when sharp cannot
 *    decode HEIC directly.
 *  - synchronous `fs` helpers are fine for this one-shot maintenance script and
 *    make each read/write/delete happen in a clear order.
 *  - `path`, `os.tmpdir()`, and `fileURLToPath(import.meta.url)` provide
 *    portable paths for repo files, scratch conversion files, and ESM modules.
 *
 * sharp APIs used here:
 *  - `.metadata()` inspects EXIF/XMP/IPTC without rewriting pixels.
 *  - `.rotate()` bakes EXIF orientation into pixels before metadata is removed.
 *  - `.resize(..., fit: 'inside')` downsizes only images larger than the cap.
 *  - `.webp()` emits a web-native image while dropping original metadata.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

// ESM exposes the current module as a `file://` URL; convert it before using
// normal path helpers to locate scripts/ and the repository root.
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

// Raster formats that can carry EXIF/GPS metadata.
// SVGs are XML-based and don't carry EXIF — skip them.
const strippableExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.avif']);

// Formats that browsers can't render — auto-convert to WebP
const convertToWebExtensions = new Set(['.heic', '.heif']);

// Cap the longest edge of converted photos. Phone cameras shoot ~5712px wide,
// but the site never displays an image wider than the ~720px reading column
// (≈1440–2160px on hi-DPI screens). Downscaling shrinks files ~5–10× and, more
// importantly, slashes the per-image decode cost that makes mobile scrolling
// stutter.
const maxImageEdge = 1600;

/**
 * Strip privacy metadata and convert non-web images below `imagesDir`.
 *
 * SVG is intentionally skipped because it is XML/vector content, not a raster
 * container with EXIF GPS tags. The return value is designed for the sync script
 * log: small counts for success and per-file messages for conversions that fail.
 *
 * @param {string} [imagesDir] Root directory of public image assets.
 * @returns {Promise<{stripped: number, converted: number, failed: Array<{filePath: string, message: string}>, scanned: number}>}
 */
export async function stripImageMetadata(imagesDir = resolve(repoRoot, 'public', 'images')) {
  const allFiles = listFiles(imagesDir);

  const strippable = allFiles.filter((f) => strippableExtensions.has(extname(f).toLowerCase()));
  const convertible = allFiles.filter((f) => convertToWebExtensions.has(extname(f).toLowerCase()));

  let stripped = 0;
  let converted = 0;
  const failed = [];

  // Strip metadata from web-native raster images
  for (const filePath of strippable) {
    const input = readFileSync(filePath);
    // `metadata()` reads headers only; it tells us whether a rewrite is needed
    // before we pay the cost of re-encoding the image.
    const metadata = await sharp(input).metadata();

    // Only re-encode when there's actually privacy metadata to remove. Skipping
    // already-clean files keeps the pass idempotent and avoids needlessly
    // recompressing images (which degrades JPEGs and bloats WebP) on every sync.
    if (!metadata.exif && !metadata.xmp && !metadata.iptc) {
      continue;
    }

    // Auto-orient (bake any EXIF orientation into the pixels) before stripping
    // metadata. Removing EXIF without this drops the orientation tag while
    // leaving the raw pixels un-rotated, which visibly rotates the image.
    let pipeline = sharp(input).rotate();

    // Preserve format and quality — we only want to strip metadata, not degrade
    switch (metadata.format) {
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality: 100 });
        break;
      case 'png':
        pipeline = pipeline.png();
        break;
      case 'webp':
        pipeline = pipeline.webp({ lossless: true });
        break;
    }

    const output = await pipeline.toBuffer();

    if (output.length > 0) {
      writeFileSync(filePath, output);
      stripped += 1;
    }
  }

  // Convert non-web formats (HEIC/HEIF) to WebP, stripping metadata in the process
  for (const filePath of convertible) {
    try {
      const output = await convertToWebpBuffer(filePath);

      if (output.length > 0) {
        const webpPath = filePath.slice(0, -extname(filePath).length) + '.webp';
        writeFileSync(webpPath, output);
        unlinkSync(filePath);
        converted += 1;
      }
    } catch (error) {
      failed.push({ filePath, message: error.message.split('\n')[0] });
    }
  }

  return { stripped, converted, failed, scanned: strippable.length + convertible.length };
}

/**
 * Convert a HEIC/HEIF file to a WebP buffer.
 *
 * sharp's prebuilt libheif ships without an HEVC decoder ("Support for this
 * compression format has not been built in"), so it can't read HEIC directly.
 * On macOS we fall back to `sips`, which decodes via the OS codecs, to produce a
 * PNG that sharp can then encode to WebP.
 *
 * `.rotate()` auto-orients from EXIF so any rotation is baked into the pixels;
 * the WebP we emit carries no orientation tag, so without this the photo would
 * render rotated (sips preserves the orientation tag in the intermediate PNG).
 * `.resize()` caps the dimensions so we don't ship 24-megapixel photos.
 */
async function convertToWebpBuffer(filePath) {
  const input = readFileSync(filePath);

  try {
    return await sharp(input)
      .rotate()
      .resize({ width: maxImageEdge, height: maxImageEdge, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  } catch (sharpError) {
    if (process.platform !== 'darwin') {
      throw sharpError;
    }

    // `tmpdir()` asks the OS for its scratch area; `mkdtempSync` creates a
    // private subfolder there so parallel conversions do not collide.
    const tmpDir = mkdtempSync(join(tmpdir(), 'heic-convert-'));
    const pngPath = join(tmpDir, 'frame.png');

    try {
      // `execFileSync` runs the command without a shell, so arguments are passed
      // directly to `sips` rather than being re-parsed by shell expansion.
      execFileSync('sips', ['-s', 'format', 'png', filePath, '--out', pngPath], { stdio: 'ignore' });
      return await sharp(readFileSync(pngPath))
        .rotate()
        .resize({ width: maxImageEdge, height: maxImageEdge, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

/**
 * Recursively collect image paths to inspect.
 *
 * `withFileTypes` gives `Dirent` objects, letting the walk branch on
 * `isDirectory()` / `isFile()` without a separate `stat` per entry.
 */
function listFiles(dir) {
  const results = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...listFiles(entryPath));
    } else if (entry.isFile()) {
      results.push(entryPath);
    }
  }

  return results;
}

/** CLI entrypoint used after content/images sync. */
async function main() {
  const result = await stripImageMetadata();
  const parts = [];

  if (result.stripped > 0) {
    parts.push(`${result.stripped} stripped`);
  }

  if (result.converted > 0) {
    parts.push(`${result.converted} HEIC→WebP`);
  }

  if (parts.length > 0) {
    console.log(`  OK Metadata   ${parts.join(', ')}`);
  } else if (result.scanned === 0) {
    console.log('  -- Metadata   no raster images found');
  } else if (result.failed.length === 0) {
    console.log(`  -- Metadata   ${result.scanned} image(s) scanned, all clean`);
  }

  if (result.failed.length > 0) {
    console.log('  !! Could not convert (left in place):');
    for (const { filePath, message } of result.failed) {
      console.log(`     - ${relative(repoRoot, filePath)} (${message})`);
    }
  }
}

// Keep the module importable for tests while still running when invoked as a
// script. `pathToFileURL` puts Node's CLI path in the same URL form as import.meta.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((err) => {
    console.error('  !! Metadata strip failed:', err.message);
    process.exitCode = 1;
  });
}
