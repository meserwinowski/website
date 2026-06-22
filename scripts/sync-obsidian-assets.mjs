import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const defaultObsidianRoot = join(process.env.HOME ?? process.env.USERPROFILE ?? '', 'obsidian', 'vault');
const defaultVaultDir = join(defaultObsidianRoot, 'Projects', 'Website');
const defaultExcalidrawDir = join(defaultObsidianRoot, 'Excalidraw');
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
  assetsDir = resolve(repoRoot, 'public', 'obsidian-assets'),
} = {}) {
  const searchDirs = normalizeAssetSearchDirs(assetSearchDirs ?? getDefaultAssetSearchDirs(vaultDir), vaultDir);
  const markdownFiles = contentDirs.flatMap((contentDir) => listFiles(contentDir, markdownExtensions));
  const targets = new Set(
    markdownFiles.flatMap((filePath) => extractEmbedTargets(readFileSync(filePath, 'utf-8'))),
  );

  rmSync(assetsDir, { recursive: true, force: true });
  mkdirSync(assetsDir, { recursive: true });

  let copied = 0;
  const missing = [];

  for (const target of targets) {
    const asset = resolveAssetReference(searchDirs, target);

    if (!asset) {
      missing.push(target);
      continue;
    }

    const destination = resolve(assetsDir, asset.publicPath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(asset.sourcePath, destination);
    copied += 1;
  }

  return {
    copied,
    missing,
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
