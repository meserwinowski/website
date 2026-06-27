import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

// Raster formats that can carry EXIF/GPS metadata.
// SVGs are XML-based and don't carry EXIF — skip them.
const strippableExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.avif']);

// Formats that browsers can't render — auto-convert to WebP
const convertToWebExtensions = new Set(['.heic', '.heif']);

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

// Convert a HEIC/HEIF file to a WebP buffer.
// sharp's prebuilt libheif ships without an HEVC decoder ("Support for this
// compression format has not been built in"), so it can't read HEIC directly.
// On macOS we fall back to `sips`, which decodes via the OS codecs, to produce a
// PNG that sharp can then encode to WebP.
//
// `.rotate()` auto-orients from EXIF so any rotation is baked into the pixels;
// the WebP we emit carries no orientation tag, so without this the photo would
// render rotated (sips preserves the orientation tag in the intermediate PNG).
async function convertToWebpBuffer(filePath) {
  const input = readFileSync(filePath);

  try {
    return await sharp(input).rotate().webp({ quality: 90 }).toBuffer();
  } catch (sharpError) {
    if (process.platform !== 'darwin') {
      throw sharpError;
    }

    const tmpDir = mkdtempSync(join(tmpdir(), 'heic-convert-'));
    const pngPath = join(tmpDir, 'frame.png');

    try {
      execFileSync('sips', ['-s', 'format', 'png', filePath, '--out', pngPath], { stdio: 'ignore' });
      return await sharp(readFileSync(pngPath)).rotate().webp({ quality: 90 }).toBuffer();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

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

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((err) => {
    console.error('  !! Metadata strip failed:', err.message);
    process.exitCode = 1;
  });
}
