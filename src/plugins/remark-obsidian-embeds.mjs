import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, isAbsolute, relative, resolve } from 'node:path';
import sharp from 'sharp';

const defaultAssetBaseUrl = '/images/';
const webImageExtensions = ['.svg', '.png', '.webp', '.jpg', '.jpeg', '.gif'];
const directImageExtensions = new Set(webImageExtensions);
// Browsers can't render HEIC/HEIF; the sync pipeline converts them to WebP, so
// embeds pointing at these are rewritten to the converted .webp asset.
const convertToWebpExtensions = new Set(['.heic', '.heif']);
const embedPattern = /!\[\[([^\]]+)\]\]/g;
// Longest edge of the inlined low-quality placeholder (LQIP). Tiny enough to add
// only a few hundred bytes per image, large enough to read as a blurred preview
// once the browser upscales it to fill the reserved box.
const placeholderEdge = 20;
// Memoizes intrinsic dimensions + placeholder per resolved file so an image
// embedded more than once is only read and downsampled from disk once per build.
const imageInfoCache = new Map();

export default function remarkObsidianEmbeds(options = {}) {
  const assetBaseUrl = options.assetBaseUrl ?? defaultAssetBaseUrl;
  const assetsDir = options.assetsDir ? resolve(options.assetsDir) : null;
  const contentRoot = options.contentRoot ? resolve(options.contentRoot) : null;

  return async function transform(tree, file) {
    const filePath = file?.path ?? file?.history?.[file.history.length - 1] ?? null;
    const prefix = assetFolderForContentFile(contentRoot, filePath);
    // Shared across the page so the first embedded image can load eagerly while
    // the rest stay lazy.
    const state = { firstImageEmitted: false };
    await transformChildren(tree, { assetBaseUrl, assetsDir, prefix, state });
  };
}

async function transformChildren(parent, options) {
  if (!Array.isArray(parent.children)) {
    return;
  }

  const nextChildren = [];

  for (const child of parent.children) {
    const blockEmbed = await parseBlockEmbed(child, options);

    if (blockEmbed) {
      nextChildren.push(blockEmbed);
      continue;
    }

    if (child.type === 'text') {
      nextChildren.push(...splitTextNode(child, options));
      continue;
    }

    await transformChildren(child, options);
    nextChildren.push(child);
  }

  parent.children = nextChildren;
}

async function parseBlockEmbed(node, options) {
  if (node.type !== 'paragraph' || node.children?.length !== 1 || node.children[0]?.type !== 'text') {
    return null;
  }

  const value = node.children[0].value.trim();
  const match = value.match(/^!\[\[([^\]]+)\]\]$/);

  if (!match) {
    return null;
  }

  const image = parseEmbed(match[1], options);

  if (!image) {
    return null;
  }

  // Intrinsic dimensions let the browser reserve layout space up front, and an
  // inlined low-quality placeholder fills that space with a blurred preview so
  // images don't flash blank when scrolled into view faster than they load.
  if (options.assetsDir && image.publicPath) {
    const info = await readImageInfo(resolve(options.assetsDir, image.publicPath));

    if (info) {
      image.width = image.width ?? info.width;
      image.height = image.height ?? info.height;
      image.placeholder = info.placeholder;
    }
  }

  // The first image on the page is the likely above-the-fold / LCP element, so
  // load it eagerly with high priority; everything below stays lazy.
  const eager = !options.state?.firstImageEmitted;

  if (options.state) {
    options.state.firstImageEmitted = true;
  }

  return {
    type: 'html',
    value: renderImageHtml(image, { eager }),
  };
}

function splitTextNode(node, options) {
  const nodes = [];
  let lastIndex = 0;
  let match;

  while ((match = embedPattern.exec(node.value)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', value: node.value.slice(lastIndex, match.index) });
    }

    const image = parseEmbed(match[1], options);

    if (image) {
      nodes.push({
        type: 'image',
        url: image.src,
        alt: image.alt,
        title: null,
      });
    } else {
      nodes.push({ type: 'text', value: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < node.value.length) {
    nodes.push({ type: 'text', value: node.value.slice(lastIndex) });
  }

  return nodes.length > 0 ? nodes : [node];
}

function parseEmbed(rawEmbed, options) {
  const parts = rawEmbed.split('|').map((part) => part.trim()).filter(Boolean);
  const target = normalizeTarget(parts[0] ?? '');

  if (!target) {
    return null;
  }

  const dimensions = parts.map(parseDimensions).find(Boolean);
  const explicitAlt = parts.find((part, index) => index > 0 && !parseDimensions(part));
  const asset = toAssetUrl(target, options);

  if (!asset) {
    return null;
  }

  return {
    src: asset.url,
    publicPath: asset.publicPath,
    alt: cleanAltText(explicitAlt ?? basenameWithoutKnownExtension(target)),
    width: dimensions?.width,
    height: dimensions?.height,
  };
}

function toAssetUrl(target, { assetBaseUrl, assetsDir, prefix }) {
  const extension = extname(target).toLowerCase();
  const name = basename(target);
  let assetFile;

  if (extension === '.excalidraw') {
    assetFile = resolveExcalidrawExportFile(name, assetsDir, prefix);
  } else if (convertToWebpExtensions.has(extension)) {
    assetFile = `${name.slice(0, -extension.length)}.webp`;
  } else if (directImageExtensions.has(extension)) {
    assetFile = name;
  } else {
    return null;
  }

  const publicPath = joinAssetPath(prefix, assetFile);
  return { url: `${assetBaseUrl.replace(/\/?$/, '/')}${encodePath(publicPath)}`, publicPath };
}

// Reads an image's intrinsic dimensions and builds a tiny inlined placeholder.
// SVGs are resolution-independent (and already tiny), so they're skipped.
// Failures (e.g. the file isn't synced yet) degrade gracefully to no info
// rather than breaking the build.
async function readImageInfo(filePath) {
  if (extname(filePath).toLowerCase() === '.svg') {
    return null;
  }

  if (imageInfoCache.has(filePath)) {
    return imageInfoCache.get(filePath);
  }

  let info = null;

  try {
    const buffer = readFileSync(filePath);
    const { width, height } = await sharp(buffer).metadata();

    if (width && height) {
      const preview = await sharp(buffer)
        .resize(placeholderEdge, placeholderEdge, { fit: 'inside' })
        .webp({ quality: 50 })
        .toBuffer();

      info = {
        width: String(width),
        height: String(height),
        placeholder: `data:image/webp;base64,${preview.toString('base64')}`,
      };
    }
  } catch {}

  imageInfoCache.set(filePath, info);
  return info;
}

function resolveExcalidrawExportFile(name, assetsDir, prefix) {
  const base = name.slice(0, -extname(name).length);

  if (assetsDir) {
    for (const extension of webImageExtensions) {
      const candidate = joinAssetPath(prefix, `${base}${extension}`);

      if (existsSync(resolve(assetsDir, candidate))) {
        return `${base}${extension}`;
      }
    }
  }

  return `${base}.svg`;
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

function parseDimensions(value) {
  const match = value.match(/^(\d+)x(\d+)$/i);

  if (!match) {
    return null;
  }

  return {
    width: match[1],
    height: match[2],
  };
}

function renderImageHtml(image, { eager = false } = {}) {
  // The placeholder is painted as the element's background; the real image draws
  // on top and hides it once loaded. Upscaling the ~20px preview to cover the
  // box is what gives the soft blur, so no CSS filter is needed.
  const style = image.placeholder
    ? `background-image:url(${image.placeholder});background-size:cover;background-position:center`
    : null;

  const attributes = [
    ['src', image.src],
    ['alt', image.alt],
    ['width', image.width],
    ['height', image.height],
    ['style', style],
    ['loading', eager ? 'eager' : 'lazy'],
    ['fetchpriority', eager ? 'high' : null],
    ['decoding', 'async'],
  ]
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}="${escapeHtmlAttribute(value)}"`)
    .join(' ');

  return `<img ${attributes} />`;
}

function normalizeTarget(rawTarget) {
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

function basenameWithoutKnownExtension(target) {
  const fileName = basename(target);
  const extension = extname(fileName);

  const lowerExtension = extension.toLowerCase();

  if (
    lowerExtension === '.excalidraw' ||
    directImageExtensions.has(lowerExtension) ||
    convertToWebpExtensions.has(lowerExtension)
  ) {
    return fileName.slice(0, -extension.length);
  }

  return fileName;
}

function cleanAltText(value) {
  return basenameWithoutKnownExtension(value).replaceAll('-', ' ');
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
