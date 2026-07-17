/**
 * generate-card-thumbnails.mjs — Build small, responsive project-card thumbnails.
 *
 * Project cards (home feed + /projects) display a thumbnail in a fixed 16:9 box
 * only ~300px wide, but the frontmatter `thumbnail` points at a full-size synced
 * asset (capped at 2048px by strip-image-metadata.mjs). Shipping that original to
 * every card means downloading ~0.5–1 MB to paint a tiny tile.
 *
 * This build-time step reads each project's `thumbnail`, and for raster images
 * emits a couple of small WebP derivatives (a 1× and 2× card image, center-cropped
 * to 16:9) plus a manifest entry describing the responsive `srcset`, intrinsic
 * dimensions, and a tiny inline LQIP blur-up. `ProjectCard.astro` reads the
 * manifest (via src/lib/cardThumbnail) and renders the derivatives; anything not
 * in the manifest (SVG, external URL, missing file) falls back to the raw path.
 *
 * It shares the vault-resolution helpers exported by sync-obsidian-assets.mjs so
 * the "which file does this thumbnail point at" logic stays in one place, and
 * mirrors the sharp + LQIP technique used by remark-obsidian-embeds.mjs.
 *
 * The derivatives and manifest are regenerated on every build (wired via the
 * `prebuild` npm script) and are gitignored rather than committed.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { extractThumbnail, thumbnailReference } from './sync-obsidian-assets.mjs';

// ESM has no __dirname; derive it from the module URL to locate the repo root.
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

// Only raster formats are worth downscaling. SVGs are vector/tiny, GIFs are
// usually animated, and anything else isn't a web thumbnail — all fall back to
// the raw path so the card still renders.
const rasterExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);

// Card display widths in CSS px; each becomes a WebP derivative for `srcset`.
// 400px covers a ~360px card at 1× DPI; 800px covers it at 2×.
const cardWidths = [400, 800];
// Cards render in a 16:9 media box (Tailwind `aspect-video`), so crop to match:
// this drops portrait/oversized pixels the card would only clip away.
const aspectRatio = 16 / 9;
// WebP quality for the derivatives — visually lossless at card size, tiny bytes.
const cardQuality = 72;
// Longest edge of the inline LQIP blur-up (mirrors remark-obsidian-embeds).
const placeholderEdge = 24;

const manifestFilename = '.card-thumbnails.json';

/**
 * Generate card-thumbnail derivatives + manifest for every project thumbnail.
 *
 * Exported so tests can drive it with custom roots. Returns counts plus the
 * manifest so callers can log or assert on the result.
 *
 * @param {object} [options]
 * @param {string} [options.contentDir] Folder of project markdown files.
 * @param {string} [options.assetsDir] Root of published assets (`public/assets`).
 * @param {number[]} [options.widths] Derivative widths in CSS px.
 * @returns {Promise<{generated: number, upToDate: number, skipped: string[], removed: number, manifest: Record<string, object>, manifestPath: string, assetsDir: string}>}
 */
export async function generateCardThumbnails({
  contentDir = resolve(repoRoot, 'src', 'content', 'projects'),
  assetsDir = resolve(repoRoot, 'public', 'assets'),
  widths = cardWidths,
} = {}) {
  const markdownFiles = listMarkdown(contentDir);
  const manifest = {};
  const generatedFiles = new Set();

  let generated = 0;
  let upToDate = 0;
  const skipped = [];

  for (const filePath of markdownFiles) {
    const thumbnail = extractThumbnail(readFileSync(filePath, 'utf-8'));
    const reference = thumbnailReference(thumbnail);

    // Non-`/assets` paths (external URLs, legacy `/images/...`) have no reference.
    if (!reference) {
      if (thumbnail) {
        skipped.push(thumbnail);
      }
      continue;
    }

    const sourcePath = resolve(assetsDir, reference.target);
    const extension = extname(reference.target).toLowerCase();

    // Skip SVGs and any thumbnail whose file hasn't been synced yet.
    if (!rasterExtensions.has(extension) || !existsSync(sourcePath)) {
      skipped.push(thumbnail);
      continue;
    }

    const entry = await buildEntry({ thumbnail, reference, sourcePath, assetsDir, widths, generatedFiles });

    if (!entry) {
      skipped.push(thumbnail);
      continue;
    }

    manifest[thumbnail] = entry.manifestEntry;
    generated += entry.generated;
    upToDate += entry.upToDate;
  }

  const removed = cleanStaleDerivatives(assetsDir, generatedFiles);

  const manifestPath = resolve(assetsDir, manifestFilename);
  mkdirSync(assetsDir, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(sortByKey(manifest), null, 2) + '\n');

  return { generated, upToDate, skipped, removed, manifest, manifestPath, assetsDir };
}

/**
 * Produce every derivative + the manifest entry for a single thumbnail.
 *
 * Reads the source once, center-crops to 16:9 at each width, and reuses the
 * cropped pixels for a tiny LQIP. Encoding is skipped for derivatives already
 * newer than the source (the same mtime heuristic the sync script uses), but the
 * manifest entry is always rebuilt so the data stays correct across runs.
 */
async function buildEntry({ thumbnail, reference, sourcePath, assetsDir, widths, generatedFiles }) {
  const folder = dirname(reference.target);
  const base = basename(reference.target, extname(reference.target));
  const publicDir = folder === '.' ? '' : folder;

  const input = readFileSync(sourcePath);
  const metadata = await sharp(input).metadata();

  if (!metadata.width || !metadata.height) {
    return null;
  }

  const sourceMtime = statSync(sourcePath).mtimeMs;
  const srcsetParts = [];
  let generated = 0;
  let upToDate = 0;

  for (const width of widths) {
    const height = Math.round(width / aspectRatio);
    const filename = `${base}-card-${width}.webp`;
    const publicPath = publicDir ? `${publicDir}/${filename}` : filename;
    const outputPath = resolve(assetsDir, publicPath);

    generatedFiles.add(resolve(assetsDir, publicPath));

    if (isUpToDate(outputPath, sourceMtime)) {
      upToDate += 1;
    } else {
      const output = await sharp(input)
        .rotate()
        .resize({ width, height, fit: 'cover', position: 'centre', withoutEnlargement: true })
        .webp({ quality: cardQuality })
        .toBuffer();

      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, output);
      generated += 1;
    }

    srcsetParts.push(`/assets/${publicPath} ${width}w`);
  }

  const lqip = await buildPlaceholder(input);
  const nominalWidth = widths[0];
  const nominalHeight = Math.round(nominalWidth / aspectRatio);

  return {
    generated,
    upToDate,
    manifestEntry: {
      src: `/assets/${publicDir ? `${publicDir}/` : ''}${base}-card-${nominalWidth}.webp`,
      srcset: srcsetParts.join(', '),
      width: widths.at(-1),
      height: Math.round(widths.at(-1) / aspectRatio),
      lqip,
    },
  };
}

/**
 * Build a tiny inline WebP data URI used as a blurred placeholder.
 *
 * Cropped to the same 16:9 box as the card so the blur-up lines up with the
 * final image; upscaling the ~24px preview to cover the box supplies the blur.
 */
async function buildPlaceholder(input) {
  const previewHeight = Math.round(placeholderEdge / aspectRatio);
  const preview = await sharp(input)
    .rotate()
    .resize({ width: placeholderEdge, height: previewHeight, fit: 'cover', position: 'centre' })
    .webp({ quality: 50 })
    .toBuffer();

  return `data:image/webp;base64,${preview.toString('base64')}`;
}

/** An output is reusable when it exists and is at least as new as its source. */
function isUpToDate(outputPath, sourceMtime) {
  try {
    return statSync(outputPath).mtimeMs >= sourceMtime;
  } catch {
    return false;
  }
}

/**
 * Remove derivative files from previous runs that are no longer referenced.
 *
 * Only files matching the `-card-<width>.webp` naming this script owns are
 * considered, so unrelated assets are never touched.
 */
function cleanStaleDerivatives(assetsDir, keepPaths) {
  if (!existsSync(assetsDir)) {
    return 0;
  }

  let removed = 0;

  for (const filePath of listFiles(assetsDir)) {
    if (!/-card-\d+\.webp$/.test(filePath) || keepPaths.has(filePath)) {
      continue;
    }

    rmSync(filePath);
    removed += 1;
  }

  return removed;
}

/** List project markdown files (non-recursive is fine; projects are flat). */
function listMarkdown(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.mdx?$/.test(entry.name))
    .map((entry) => join(dir, entry.name));
}

/** Recursively collect every file path under a directory. */
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

/** Return a new object with keys sorted, for stable manifest diffs. */
function sortByKey(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

/** CLI entrypoint used by the `prebuild` npm script. */
async function main() {
  const result = await generateCardThumbnails();
  const relativeAssetsDir = relative(repoRoot, result.assetsDir) || result.assetsDir;
  const entries = Object.keys(result.manifest).length;

  console.log(`  OK Card thumbs ${entries} thumbnail(s) -> ${relativeAssetsDir}`);

  if (result.generated > 0) {
    console.log(`     ${result.generated} derivative(s) generated`);
  }

  if (result.upToDate > 0) {
    console.log(`     ${result.upToDate} already up-to-date (skipped)`);
  }

  if (result.removed > 0) {
    console.log(`     ${result.removed} stale derivative(s) removed`);
  }
}

// Run when invoked directly; stay importable (no side effects) for tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('  !! Card thumbnail generation failed:', error.message);
    process.exitCode = 1;
  });
}
