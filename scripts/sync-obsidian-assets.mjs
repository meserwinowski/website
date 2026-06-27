import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
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

export function syncObsidianAssets({
  vaultDir = defaultVaultDir,
  assetSearchDirs,
  contentDirs = [resolve(repoRoot, 'src', 'content', 'projects'), resolve(repoRoot, 'src', 'content', 'pages')],
  contentRoot = resolve(repoRoot, 'src', 'content'),
  assetsDir = resolve(repoRoot, 'public', 'images'),
} = {}) {
  const searchDirs = normalizeAssetSearchDirs(assetSearchDirs ?? getDefaultAssetSearchDirs(vaultDir), vaultDir);
  const markdownFiles = contentDirs.flatMap((contentDir) => listFiles(contentDir, markdownExtensions));

  // Group each embed under a folder derived from its content file, so a project's
  // assets land in images/<project-folder>/ instead of scattered at the root.
  const references = new Map();

  for (const filePath of markdownFiles) {
    const prefix = assetFolderForContentFile(contentRoot, filePath);

    for (const target of extractEmbedTargets(readFileSync(filePath, 'utf-8'))) {
      references.set(`${prefix}\u0000${target}`, { prefix, target });
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

  // Write manifest so future syncs can clean up stale embed files
  writeFileSync(manifestPath, JSON.stringify(syncedPaths.sort(), null, 2) + '\n');

  // Remove embed files from previous sync that are no longer referenced
  const currentSet = new Set(syncedPaths);
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
    synced: syncedPaths,
    targets: [...references.values()].map(({ target }) => target),
    assetsDir,
    searchDirs,
  };
}

// An output is up to date when it exists and is at least as new as its source,
// the same mtime heuristic incremental build tools use to skip unchanged work.
function isUpToDate(outputPath, sourcePath) {
  try {
    return statSync(outputPath).mtimeMs >= statSync(sourcePath).mtimeMs;
  } catch {
    return false;
  }
}

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

    // Copy the raw HEIC/HEIF into public/images (at copyPublicPath); the metadata
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

// Place a project's embedded assets under a folder mirroring the content file's
// location, e.g. src/content/projects/stage-mixer.md -> images/projects/stage-mixer/.
function assetFolderForContentFile(contentRoot, filePath) {
  if (!contentRoot || !filePath) {
    return '';
  }

  const relativePath = relative(contentRoot, filePath);

  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return '';
  }

  return relativePath.replace(/\.[^./\\]+$/, '').split(/[\\/]/).join('/');
}

function joinAssetPath(prefix, file) {
  return prefix ? `${prefix}/${file}` : file;
}

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

function getDefaultAssetSearchDirs(vaultDir) {
  const searchDirs = [vaultDir];

  if (resolve(vaultDir) === resolve(defaultVaultDir)) {
    searchDirs.push(defaultExcalidrawDir);
  }

  return searchDirs;
}

function normalizeAssetSearchDirs(assetSearchDirs, vaultDir) {
  return [...new Set([vaultDir, ...assetSearchDirs].map((dir) => resolve(dir)))];
}

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

function isPathInside(parent, child) {
  const relativePath = relative(resolve(parent), resolve(child));
  return Boolean(relativePath) && !relativePath.startsWith('..') && !statSync(parent).isFile();
}

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
