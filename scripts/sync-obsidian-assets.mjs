import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
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
  assetsDir = resolve(repoRoot, 'public', 'images'),
} = {}) {
  const searchDirs = normalizeAssetSearchDirs(assetSearchDirs ?? getDefaultAssetSearchDirs(vaultDir), vaultDir);
  const markdownFiles = contentDirs.flatMap((contentDir) => listFiles(contentDir, markdownExtensions));
  const targets = new Set(
    markdownFiles.flatMap((filePath) => extractEmbedTargets(readFileSync(filePath, 'utf-8'))),
  );

  const manifestPath = resolve(assetsDir, '.embed-manifest.json');
  let previousEmbedFiles = [];

  try {
    if (existsSync(manifestPath)) {
      previousEmbedFiles = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    }
  } catch {}

  mkdirSync(assetsDir, { recursive: true });

  let copied = 0;
  const missing = [];
  const syncedPaths = [];

  for (const target of targets) {
    const asset = resolveAssetReference(searchDirs, target);

    if (!asset) {
      missing.push(target);
      continue;
    }

    const destination = resolve(assetsDir, asset.publicPath);
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
          rmSync(parent);
          parent = dirname(parent);
        } else {
          break;
        }
      }
    }
  }

  return {
    copied,
    missing,
    staleRemoved,
    targets: [...targets],
    assetsDir,
    searchDirs,
  };
}

export function resolveAssetReference(assetSearchDirs, target) {
  const searchDirs = Array.isArray(assetSearchDirs) ? assetSearchDirs : [assetSearchDirs];
  const extension = extname(target).toLowerCase();

  if (extension === '.excalidraw') {
    return resolveExcalidrawExport(searchDirs, target);
  }

  if (exactWebImageExtensions.has(extension)) {
    const sourcePath = findVaultFile(searchDirs, target);

    if (!sourcePath) {
      return null;
    }

    return {
      sourcePath,
      publicPath: target,
    };
  }

  return null;
}

function resolveExcalidrawExport(searchDirs, target) {
  const withoutExtension = target.slice(0, -extname(target).length);

  for (const extension of webImageExtensions) {
    for (const candidate of [`${withoutExtension}${extension}`, `${target}${extension}`]) {
      const sourcePath = findVaultFile(searchDirs, candidate);

      if (sourcePath) {
        return {
          sourcePath,
          publicPath: `${withoutExtension}${extension}`,
        };
      }
    }
  }

  return null;
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

  console.log(`  OK Assets     ${result.copied} files -> ${relativeAssetsDir}`);

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
