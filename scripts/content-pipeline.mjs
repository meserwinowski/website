import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { isArchivedProject, isPublicProject } from '../src/lib/projectStatus.ts';
import { pageSchema, projectSchema } from '../src/lib/contentSchemas.ts';
import { extractEmbedTargets, extractThumbnail, resolveAssetReference, syncObsidianAssets, thumbnailReference } from './sync-obsidian-assets.mjs';
import { stripImageMetadata } from './strip-image-metadata.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webImage = /\.(svg|png|webp|jpe?g|gif|avif)$/i;

function inside(root, path) {
  const name = relative(root, path);
  return name !== '' && !isAbsolute(name) && name.split(sep)[0] !== '..';
}

function safePath(root, name) {
  if (!name || isAbsolute(name) || /^[a-z]:/i.test(name) || name.includes('\\') ||
      name.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid content path: ${name}`);
  }
  const path = resolve(root, name);
  if (!inside(resolve(root), path)) throw new Error(`Content path escapes its root: ${name}`);
  return path;
}

function files(root) {
  if (lstatSync(root).isSymbolicLink()) throw new Error('Content roots must not be symlinks.');
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Content must not contain symlinks: ${entry.name}`);
    return entry.isDirectory() ? files(path) : [path];
  });
}

export function readNote(path) {
  const text = readFileSync(path, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) throw new Error(`Missing frontmatter: ${basename(path)}`);
  return { data: parse(match[1]), body: text.slice(match[0].length), text };
}

function normalize(text) {
  let fence = null;
  return text.split('\n').map(line => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker && (!fence || (marker[0] === fence[0] && marker.length >= fence.length))) {
      fence = fence ? null : marker;
    }
    return fence ? line : line.replace(/^[ \t]+/, indent => indent.replaceAll('\t', '  '));
  }).join('\n');
}

function gitState(root) {
  try {
    return {
      sha: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(),
      dirty: Boolean(execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).trim()),
    };
  } catch {
    return { sha: null, dirty: true };
  }
}

function json(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function copy(source, target) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

function validateSite(site) {
  for (const field of ['name', 'fullName', 'wordmark', 'description', 'homeDescription', 'projectsDescription', 'feedDescription', 'aboutTagline']) {
    if (typeof site[field] !== 'string' || !site[field]) throw new Error(`Missing site field: ${field}`);
  }
  if (!Array.isArray(site.publishedPages) || !site.publishedPages.includes('about') || !Array.isArray(site.archivePages)) {
    throw new Error('A publication allowlist including About and an archive registry are required.');
  }
  const slugs = new Set();
  for (const page of site.archivePages) {
    if (!/^[a-z0-9_-]+$/.test(page.slug) || slugs.has(page.slug) || !site.publishedPages.includes(page.entry) ||
        !page.title || !page.heading || !page.description || !Number.isFinite(Date.parse(page.date)) ||
        !page.media?.src || !Array.isArray(page.images)) {
      throw new Error('Invalid or duplicate standalone archive entry.');
    }
    slugs.add(page.slug);
  }
}

function assetNames(note, prefix, searchDirs) {
  const references = extractEmbedTargets(note.text).map(target => ({ target, prefix }));
  const thumbnail = thumbnailReference(extractThumbnail(note.text));
  if (thumbnail) references.push(thumbnail);
  return references.map(({ target, prefix: folder }) => {
    const asset = resolveAssetReference(searchDirs, target, folder);
    if (!asset) throw new Error(`Missing referenced asset: ${target}`);
    return asset.publicPath;
  });
}

export async function exportContent({ vaultDir, destination, assetSearchDirs = [] }) {
  const vault = realpathSync(vaultDir);
  const target = realpathSync(destination);
  if (target === repoRoot || inside(repoRoot, target) ||
      target === vault || inside(vault, target) || inside(target, vault)) {
    throw new Error('The publishing checkout must be separate from the vault.');
  }
  const site = JSON.parse(readFileSync(join(vault, 'site.json'), 'utf8'));
  validateSite(site);
  const scratch = mkdtempSync(join(tmpdir(), 'website-export-'));
  try {
    const contentRoot = join(scratch, 'content');
    const assetsDir = join(scratch, 'assets');
    // Preserve the existing mtime-based conversion cache without mirroring
    // unrelated files from the private checkout.
    try {
      const prior = JSON.parse(readFileSync(join(target, 'manifest.json'), 'utf8'));
      if (prior.version !== 1 || prior.mode !== 'production') throw new Error('No compatible cache');
      files(join(target, 'assets'));
      const names = [...new Set(prior.documents.flatMap(document => document.assets))];
      for (const name of names) {
        if (!webImage.test(name)) throw new Error('Non-image cache entry');
        const source = safePath(join(target, 'assets'), name);
        const output = safePath(assetsDir, name);
        mkdirSync(dirname(output), { recursive: true });
        cpSync(source, output, { preserveTimestamps: true });
      }
      json(join(assetsDir, '.embed-manifest.json'), names);
    } catch {
      rmSync(assetsDir, { recursive: true, force: true });
    }
    const documents = [];
    for (const collection of ['projects', 'pages']) {
      const source = join(vault, collection);
      for (const path of files(source).filter(path => path.endsWith('.md'))) {
        const name = relative(source, path).split('\\').join('/');
        const output = safePath(join(contentRoot, collection), name);
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(output, normalize(readFileSync(path, 'utf8')));
        const note = readNote(output);
        (collection === 'projects' ? projectSchema : pageSchema).parse(note.data);
        documents.push({
          path: `${collection}/${name}`,
          assets: assetNames(note, basename(name, '.md'), [vault, ...assetSearchDirs]),
        });
      }
    }
    const synced = syncObsidianAssets({
      vaultDir: vault, assetSearchDirs,
      contentRoot, contentDirs: ['projects', 'pages'].map(name => join(contentRoot, name)), assetsDir,
    });
    if (synced.missing.length) throw new Error('Referenced image exports are missing.');
    for (const page of site.archivePages) {
      const document = documents.find(document => document.path === `pages/${page.entry}.md`);
      if (!document) throw new Error(`Missing standalone page: ${page.entry}`);
      for (const image of [page.media, ...page.images]) {
        if (!image.src.startsWith('/assets/')) continue;
        const name = image.src.slice('/assets/'.length);
        safePath(assetsDir, name);
        const asset = resolveAssetReference([vault, ...assetSearchDirs], basename(name), dirname(name) === '.' ? '' : dirname(name));
        if (!asset) throw new Error(`Missing standalone image: ${name}`);
        copy(asset.sourcePath, safePath(assetsDir, asset.copyPublicPath ?? asset.publicPath));
        document.assets.push(asset.publicPath);
      }
    }
    const stripped = await stripImageMetadata(assetsDir);
    if (stripped.failed.length) throw new Error('Image conversion failed; export was not published.');
    rmSync(join(assetsDir, '.embed-manifest.json'), { force: true });
    json(join(scratch, 'site.json'), site);
    json(join(scratch, 'manifest.json'), { version: 1, mode: 'production', documents });
    // Only these generated paths are owned by the exporter, never the checkout root.
    for (const name of ['content', 'assets', 'site.json', 'manifest.json']) {
      const output = join(target, name);
      rmSync(output, { recursive: true, force: true });
      for (const path of files(scratch).filter(path => path === join(scratch, name) || inside(join(scratch, name), path))) {
        copy(path, join(target, relative(scratch, path)));
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function assembleContent({ source, root = repoRoot, mode = 'production' }) {
  const input = realpathSync(source);
  const output = resolve(root);
  if (input === output || ['src/content', 'public/assets', '.site-content'].some(path =>
    input === join(output, path) || inside(join(output, path), input))) {
    throw new Error('Content input must be outside the generated website tree.');
  }
  const manifest = JSON.parse(readFileSync(join(input, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || manifest.mode !== mode || !Array.isArray(manifest.documents)) {
    throw new Error(`A valid ${mode} content snapshot is required; demo fallback is disabled.`);
  }
  const site = JSON.parse(readFileSync(join(input, 'site.json'), 'utf8'));
  validateSite(site);
  files(join(input, 'content'));
  files(join(input, 'assets'));
  const documents = [];
  const assets = new Set();
  const seen = new Set();
  for (const document of manifest.documents) {
    if (seen.has(document.path)) throw new Error(`Duplicate content entry: ${document.path}`);
    seen.add(document.path);
    const path = safePath(join(input, 'content'), document.path);
    const note = readNote(path);
    const published = document.path.startsWith('projects/') ?
      (isPublicProject(note.data.status) || isArchivedProject(note.data.status)) :
      document.path.startsWith('pages/') && site.publishedPages.includes(document.path.slice(6, -3));
    if (!published) continue;
    documents.push({ path, name: document.path });
    for (const asset of document.assets) {
      const path = safePath(join(input, 'assets'), asset);
      if (!existsSync(path) || !webImage.test(asset) || basename(asset).startsWith('.')) {
        throw new Error(`Missing or non-publishable asset: ${asset}`);
      }
      assets.add(asset);
    }
  }
  for (const page of site.publishedPages) {
    if (!documents.some(document => document.name === `pages/${page}.md`)) throw new Error(`Missing published page: ${page}`);
  }
  for (const path of ['src/content', 'public/assets', '.site-content']) {
    rmSync(join(output, path), { recursive: true, force: true });
    mkdirSync(join(output, path), { recursive: true });
  }
  for (const document of documents) copy(document.path, safePath(join(output, 'src/content'), document.name));
  for (const asset of assets) copy(safePath(join(input, 'assets'), asset), safePath(join(output, 'public/assets'), asset));
  json(join(output, '.site-content/site.json'), site);
  json(join(output, '.site-content/provenance.json'), {
    mode, code: gitState(output), content: gitState(input),
    documents: documents.map(document => document.name), assets: [...assets].sort(),
  });
}

const main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (main) {
  try {
    const command = process.argv[2];
    const destination = resolve(process.env.CONTENT_REPO_DIR || join(repoRoot, '../website-content'));
    if (command === 'sync') {
      const vaultDir = process.env.VAULT_DIR || (process.env.VAULT_SUBPATH && join(process.env.HOME || process.env.USERPROFILE, process.env.VAULT_SUBPATH));
      if (!vaultDir) throw new Error('Set VAULT_DIR or VAULT_SUBPATH in deploy.env.');
      const extra = process.env.EXCALIDRAW_DIR || (process.env.EXCALIDRAW_SUBPATH && join(process.env.HOME || process.env.USERPROFILE, process.env.EXCALIDRAW_SUBPATH));
      await exportContent({ vaultDir, destination, assetSearchDirs: extra ? [extra] : [] });
      assembleContent({ source: destination });
      console.log('Private export and production inputs prepared. Review/commit/push content for hosted deployment.');
    } else if (command === 'assemble') {
      assembleContent({ source: destination });
    } else if (command === 'demo') {
      assembleContent({ source: join(repoRoot, 'tests/fixtures/site'), mode: 'demo' });
    } else if (command === 'verify-production') {
      const state = JSON.parse(readFileSync(join(repoRoot, '.site-content/provenance.json'), 'utf8'));
      if (state.mode !== 'production') throw new Error('Production deployment refuses demo inputs.');
      console.log(`Production inputs; code ${state.code.sha || 'uncommitted'}${state.code.dirty ? ' (local changes)' : ''}; content ${state.content.sha || 'uncommitted'}${state.content.dirty ? ' (local changes)' : ''}.`);
    } else {
      throw new Error('Expected sync, assemble, demo, or verify-production.');
    }
  } catch (error) {
    console.error(`Content preparation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
