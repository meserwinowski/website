/**
 * sync-obsidian-assets.mjs — Copy only the Obsidian images this site embeds.
 *
 * Markdown content is synced from the vault into `src/content/`, but image
 * references still point at Obsidian-style targets such as `![[photo.heic]]` in
 * the body, and site-absolute URLs such as `/assets/cover.png` in a page's
 * `thumbnail` frontmatter. This script reads the generated markdown, finds both
 * kinds of reference, resolves them back to files in the vault, and copies the
 * publishable assets into `public/assets/` using a stable folder layout named
 * for each content file.
 *
 * Project rationale:
 *  - The site should not publish the entire vault image library — only images
 *    referenced by public pages (embeds and thumbnails alike).
 *  - HEIC/HEIF files are copied as source inputs but tracked as `.webp` outputs;
 *    `strip-image-metadata.mjs` performs the actual web-friendly conversion.
 *  - A manifest lets future syncs delete embeds that disappeared from markdown.
 *
 * Node APIs used here:
 *  - synchronous `fs` helpers keep this short-lived script easy to reason about
 *    by doing one filesystem operation at a time.
 *  - `path` helpers normalize separators and safely resolve relative paths.
 *  - `fileURLToPath(import.meta.url)` converts this ESM module's `file://` URL
 *    into a real path so we can derive `scripts/` and the repo root.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ESM does not expose CommonJS's `__dirname`; derive it from the module URL.
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
// Environment overrides make the script testable and let different machines
// point at a vault without editing source code.
const fromSubpath = (subpath) => (subpath ? join(homeDir, ...subpath.split('/').filter(Boolean)) : null);
const defaultVaultDir = process.env.VAULT_DIR ?? fromSubpath(process.env.VAULT_SUBPATH) ?? join(homeDir, 'vault');
const defaultExcalidrawDir =
  process.env.EXCALIDRAW_DIR ?? fromSubpath(process.env.EXCALIDRAW_SUBPATH) ?? join(defaultVaultDir, 'Excalidraw');
const markdownExtensions = new Set(['.md', '.mdx']);
const webImageExtensions = ['.svg', '.png', '.webp', '.jpg', '.jpeg', '.gif'];
const exactWebImageExtensions = new Set(webImageExtensions);
// HEIC/HEIF aren't web-renderable. We still sync the source so the metadata
// strip step can convert it to WebP; the embed manifest tracks the .webp result.
const convertToWebpExtensions = new Set(['.heic', '.heif']);

/**
 * Return the clean file targets from Obsidian image embeds in a markdown string.
 *
 * Obsidian allows an optional display alias after a pipe
 * (`![[image.png|Small caption]]`). The website only needs the file target, so
 * aliases are stripped before paths are normalized and validated.
 *
 * @param {string} markdown Raw markdown content from a synced content file.
 * @returns {string[]} Safe embed targets, in the order they appear.
 */
export function extractEmbedTargets(markdown) {
  const targets = [];
  const embedPattern = /!\[\[([^\]]+)\]\]/g;
  let match;

  while ((match = embedPattern.exec(markdown)) !== null) {
    const target = normalizeEmbedTarget(match[1].split('|')[0] ?? '');

    if (target) {
      targets.push(target);
    }
  }

  return targets;
}

/**
 * Extract the `thumbnail` value from a content file's YAML frontmatter.
 *
 * Thumbnails are authored as site-absolute URLs (e.g. `/assets/cover.png`)
 * rather than Obsidian `![[...]]` embeds, so they need their own lightweight
 * extraction. Only the leading `---` frontmatter block is inspected, and a
 * simple single-line scalar value (optionally quoted) is supported — which is
 * all the content schema allows for this field.
 *
 * @param {string} markdown Raw markdown content from a synced content file.
 * @returns {string|null} The raw thumbnail value, or null when absent.
 */
export function extractThumbnail(markdown) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);

  if (!frontmatter) {
    return null;
  }

  const line = /^thumbnail:[ \t]*(.+?)[ \t]*$/m.exec(frontmatter[1]);

  if (!line) {
    return null;
  }

  const value = line[1].trim().replace(/^["']|["']$/g, '');
  return value || null;
}

/**
 * Turn a frontmatter thumbnail value into a syncable asset reference.
 *
 * Only site-local `/assets/...` thumbnails are pulled from the vault: the path
 * the author wrote is the published URL, so the file must land at exactly that
 * location. Any authored subfolder becomes the asset prefix and the remainder
 * resolves against the vault by name, reusing the same copy/convert pipeline as
 * embeds. External URLs and non-`/assets` paths (e.g. legacy `/images/...`) are
 * intentionally left untouched.
 *
 * @param {string|null} thumbnail Raw frontmatter thumbnail value.
 * @returns {{prefix: string, target: string}|null}
 */
export function thumbnailReference(thumbnail) {
  const assetsPrefix = '/assets/';

  if (!thumbnail || !thumbnail.startsWith(assetsPrefix)) {
    return null;
  }

  const assetRelative = normalizeEmbedTarget(thumbnail.slice(assetsPrefix.length));

  if (!assetRelative) {
    return null;
  }

  const folder = dirname(assetRelative);

  return {
    prefix: folder === '.' ? '' : folder,
    target: assetRelative,
  };
}

/**
 * Sync Obsidian embed and thumbnail assets into the website's public image directory.
 *
 * The function is exported so tests and other scripts can pass custom roots.
 * Defaults point at the real repo/vault layout used by `npm run sync`.
 *
 * @param {object} [options]
 * @param {string} [options.vaultDir] Root of the Obsidian vault to search.
 * @param {string|string[]} [options.assetSearchDirs] Extra vault folders to scan.
 * @param {string[]} [options.contentDirs] Generated markdown folders to read.
 * @param {string} [options.contentRoot] Root used to mirror content paths.
 * @param {string} [options.assetsDir] Destination under `public/assets/`.
 * @returns {object} Counts, missing targets, and paths used by the sync.
 */
export function syncObsidianAssets({
  vaultDir = defaultVaultDir,
  assetSearchDirs,
  contentDirs = [resolve(repoRoot, 'src', 'content', 'projects'), resolve(repoRoot, 'src', 'content', 'pages')],
  contentRoot = resolve(repoRoot, 'src', 'content'),
  assetsDir = resolve(repoRoot, 'public', 'assets'),
} = {}) {
  const searchDirs = normalizeAssetSearchDirs(assetSearchDirs ?? getDefaultAssetSearchDirs(vaultDir), vaultDir);
  const markdownFiles = contentDirs.flatMap((contentDir) => listFiles(contentDir, markdownExtensions));

  // Group each embed under a folder named for its content file's slug, so a
  // project's assets land in assets/<slug>/ instead of scattered at the root.
  const references = new Map();

  for (const filePath of markdownFiles) {
    const prefix = assetFolderForContentFile(contentRoot, filePath);
    const markdown = readFileSync(filePath, 'utf-8');

    for (const target of extractEmbedTargets(markdown)) {
      references.set(`${prefix}\u0000${target}`, { prefix, target });
    }

    // A frontmatter thumbnail is a published URL, not an embed, but it still has
    // to be pulled from the vault or the project card's image 404s. Resolve it
    // through the same machinery so it is copied, downscaled by the metadata
    // step, and tracked in the manifest for stale cleanup.
    const thumbnail = thumbnailReference(extractThumbnail(markdown));

    if (thumbnail) {
      references.set(`${thumbnail.prefix}\u0000${thumbnail.target}`, thumbnail);
    }
  }

  const manifestPath = resolve(assetsDir, '.embed-manifest.json');
  let previousEmbedFiles = [];

  try {
    if (existsSync(manifestPath)) {
      previousEmbedFiles = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    }
  } catch {}

  mkdirSync(assetsDir, { recursive: true });

  let copied = 0;
  let upToDate = 0;
  const missing = [];
  const syncedPaths = [];

  for (const { prefix, target } of references.values()) {
    const asset = resolveAssetReference(searchDirs, target, prefix);

    if (!asset) {
      missing.push(target);
      continue;
    }

    // The published artifact: a .webp for HEIC/HEIF, otherwise the copied file
    // itself. When it's already at least as new as the vault source, skip the
    // copy and (for HEIC) the expensive WebP conversion that runs downstream.
    // It must still be recorded in the manifest so stale-cleanup keeps it.
    const finalPath = resolve(assetsDir, asset.publicPath);

    if (isUpToDate(finalPath, asset.sourcePath)) {
      syncedPaths.push(asset.publicPath);
      upToDate += 1;
      continue;
    }

    const destination = resolve(assetsDir, asset.copyPublicPath ?? asset.publicPath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(asset.sourcePath, destination);
    syncedPaths.push(asset.publicPath);
    copied += 1;
  }

  // A thumbnail and a body embed can resolve to the same published file, so
  // dedupe before writing the manifest and computing stale-cleanup membership.
  const uniqueSynced = [...new Set(syncedPaths)];

  // Write manifest so future syncs can clean up stale embed files
  writeFileSync(manifestPath, JSON.stringify(uniqueSynced.sort(), null, 2) + '\n');

  // Remove embed files from previous sync that are no longer referenced
  const currentSet = new Set(uniqueSynced);
  let staleRemoved = 0;

  for (const oldPath of previousEmbedFiles) {
    if (!currentSet.has(oldPath)) {
      const staleFile = resolve(assetsDir, oldPath);

      if (existsSync(staleFile)) {
        rmSync(staleFile);
        staleRemoved += 1;
      }

      // Clean up empty parent directories left behind
      let parent = dirname(staleFile);

      while (parent !== assetsDir && existsSync(parent)) {
        const entries = readdirSync(parent);

        if (entries.length === 0) {
          rmdirSync(parent);
          parent = dirname(parent);
        } else {
          break;
        }
      }
    }
  }

  return {
    copied,
    upToDate,
    missing,
    staleRemoved,
    synced: uniqueSynced,
    targets: [...references.values()].map(({ target }) => target),
    assetsDir,
    searchDirs,
  };
}

/**
 * Check whether a generated/copied asset can be reused.
 *
 * An output is up to date when it exists and is at least as new as its source,
 * the same mtime heuristic incremental build tools use to skip unchanged work.
 */
function isUpToDate(outputPath, sourcePath) {
  try {
    return statSync(outputPath).mtimeMs >= statSync(sourcePath).mtimeMs;
  } catch {
    return false;
  }
}

/**
 * Resolve one normalized Obsidian embed target to a source and public output.
 *
 * Web-native images can be copied as-is. HEIC/HEIF files are copied under their
 * original name for the metadata script to consume, but this function reports
 * the eventual `.webp` path because that is what markdown should reference and
 * what stale-cleanup should track.
 *
 * @param {string|string[]} assetSearchDirs Vault directories to inspect.
 * @param {string} target Normalized embed target from markdown.
 * @param {string} [prefix] Public folder derived from the content file.
 * @returns {{sourcePath: string, publicPath: string, copyPublicPath?: string} | null}
 */
export function resolveAssetReference(assetSearchDirs, target, prefix = '') {
  const searchDirs = Array.isArray(assetSearchDirs) ? assetSearchDirs : [assetSearchDirs];
  const extension = extname(target).toLowerCase();
  const name = basename(target);

  if (extension === '.excalidraw') {
    return resolveExcalidrawExport(searchDirs, target, prefix);
  }

  if (exactWebImageExtensions.has(extension)) {
    const sourcePath = findVaultFile(searchDirs, target);

    if (!sourcePath) {
      return null;
    }

    return {
      sourcePath,
      publicPath: joinAssetPath(prefix, name),
    };
  }

  if (convertToWebpExtensions.has(extension)) {
    const sourcePath = findVaultFile(searchDirs, target);

    if (!sourcePath) {
      return null;
    }

    // Copy the raw HEIC/HEIF into public/assets (at copyPublicPath); the metadata
    // strip step converts it to publicPath (.webp) and deletes the source. The
    // manifest tracks the .webp so stale-cleanup removes it when the embed goes away.
    return {
      sourcePath,
      copyPublicPath: joinAssetPath(prefix, name),
      publicPath: joinAssetPath(prefix, `${name.slice(0, -extension.length)}.webp`),
    };
  }

  return null;
}

/**
 * Resolve an Excalidraw drawing to one of its exported web images.
 *
 * Obsidian embeds often point at `diagram.excalidraw`, but the browser needs an
 * exported PNG/WebP/JPEG/SVG. Check both common export naming patterns:
 * `diagram.png` and `diagram.excalidraw.png`.
 */
function resolveExcalidrawExport(searchDirs, target, prefix = '') {
  const withoutExtension = target.slice(0, -extname(target).length);
  const base = basename(withoutExtension);

  for (const extension of webImageExtensions) {
    for (const candidate of [`${withoutExtension}${extension}`, `${target}${extension}`]) {
      const sourcePath = findVaultFile(searchDirs, candidate);

      if (sourcePath) {
        return {
          sourcePath,
          publicPath: joinAssetPath(prefix, `${base}${extension}`),
        };
      }
    }
  }

  return null;
}

/**
 * Build the public asset subfolder for a content file.
 *
 * Group a content file's embedded assets under a folder named for its slug,
 * e.g. `src/content/projects/stage-mixer.md` becomes `assets/stage-mixer/`.
 */
function assetFolderForContentFile(contentRoot, filePath) {
  if (!contentRoot || !filePath) {
    return '';
  }

  const relativePath = relative(contentRoot, filePath);

  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return '';
  }

  return basename(filePath).replace(/\.[^.]+$/, '');
}

/** Join a normalized public folder prefix with a filename for manifest/storage. */
function joinAssetPath(prefix, file) {
  return prefix ? `${prefix}/${file}` : file;
}

/**
 * Find a vault file by exact relative path, then by basename.
 *
 * The exact lookup preserves foldered embeds. The basename fallback matches
 * Obsidian's common behavior where `![[photo.jpg]]` can resolve from anywhere
 * in the vault. `isPathInside` prevents a crafted target from escaping a search
 * root before `existsSync` checks the filesystem.
 */
function findVaultFile(searchDirs, target) {
  for (const searchDir of searchDirs) {
    const exactPath = resolve(searchDir, target);

    if (isPathInside(searchDir, exactPath) && existsSync(exactPath)) {
      return exactPath;
    }
  }

  const targetName = basename(target).toLowerCase();
  return searchDirs
    .flatMap((searchDir) => listFiles(searchDir))
    .find((filePath) => basename(filePath).toLowerCase() === targetName) ?? null;
}

/** Default search roots: the vault plus the Excalidraw export folder when known. */
function getDefaultAssetSearchDirs(vaultDir) {
  const searchDirs = [vaultDir];

  if (resolve(vaultDir) === resolve(defaultVaultDir)) {
    searchDirs.push(defaultExcalidrawDir);
  }

  return searchDirs;
}

/** Resolve and deduplicate search directories so repeated inputs do not rescan. */
function normalizeAssetSearchDirs(assetSearchDirs, vaultDir) {
  return [...new Set([vaultDir, ...assetSearchDirs].map((dir) => resolve(dir)))];
}

/**
 * Recursively list files under a directory, optionally filtered by extension.
 *
 * `readdirSync(..., { withFileTypes: true })` returns `Dirent` objects, so the
 * walk can tell files from directories without an extra `stat` call per entry.
 */
function listFiles(rootDir, allowedExtensions) {
  if (!existsSync(rootDir)) {
    return [];
  }

  const entries = readdirSync(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(rootDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listFiles(entryPath, allowedExtensions));
      continue;
    }

    if (entry.isFile() && (!allowedExtensions || allowedExtensions.has(extname(entry.name).toLowerCase()))) {
      files.push(entryPath);
    }
  }

  return files;
}

/**
 * Normalize an Obsidian embed target into a safe relative path.
 *
 * Backslashes become `/` so Windows-authored links work on macOS/Linux too.
 * Absolute paths, URLs, `.` and `..` segments are rejected because embeds should
 * only name files inside configured vault search roots.
 */
function normalizeEmbedTarget(rawTarget) {
  const target = rawTarget.trim().replaceAll('\\', '/').replace(/^\/+/, '');

  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
    return null;
  }

  const parts = target.split('/').filter(Boolean);

  if (parts.some((part) => part === '..' || part === '.')) {
    return null;
  }

  return parts.join('/');
}

/**
 * Return true when `child` resolves below `parent`.
 *
 * `path.relative` is the safety check: a result beginning with `..` means the
 * child would walk outside the parent, which should never be copied.
 */
function isPathInside(parent, child) {
  const relativePath = relative(resolve(parent), resolve(child));
  return Boolean(relativePath) && !relativePath.startsWith('..') && !statSync(parent).isFile();
}

/** CLI entrypoint used by the sync shell scripts. */
function main() {
  const result = syncObsidianAssets();
  const relativeAssetsDir = relative(repoRoot, result.assetsDir) || result.assetsDir;

  console.log(`  OK Assets     ${result.copied + result.upToDate} files -> ${relativeAssetsDir}`);

  if (result.upToDate > 0) {
    console.log(`     ${result.upToDate} already up-to-date (skipped)`);
  }

  if (result.staleRemoved > 0) {
    console.log(`     ${result.staleRemoved} stale embed(s) removed`);
  }

  if (result.missing.length > 0) {
    console.log('  !! Missing web exports for embeds:');
    for (const target of result.missing) {
      console.log(`     - ${target}`);
    }
  }
}

// ESM "am I the main script?" check: compare this module URL to the CLI path
// converted back into a file URL. This keeps exports importable without running.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
