import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
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

  // Strip metadata from web-native raster images
  for (const filePath of strippable) {
    const input = readFileSync(filePath);
    const metadata = await sharp(input).metadata();
    let pipeline = sharp(input);

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
    const input = readFileSync(filePath);
    const output = await sharp(input).webp({ quality: 90 }).toBuffer();

    if (output.length > 0) {
      const webpPath = filePath.slice(0, -extname(filePath).length) + '.webp';
      writeFileSync(webpPath, output);
      unlinkSync(filePath);
      converted += 1;
    }
  }

  return { stripped, converted, scanned: strippable.length + convertible.length };
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
  } else {
    console.log(`  -- Metadata   ${result.scanned} image(s) scanned, all clean`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((err) => {
    console.error('  !! Metadata strip failed:', err.message);
    process.exitCode = 1;
  });
}
