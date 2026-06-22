import { existsSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';

const defaultAssetBaseUrl = '/obsidian-assets/';
const webImageExtensions = ['.svg', '.png', '.webp', '.jpg', '.jpeg', '.gif'];
const directImageExtensions = new Set(webImageExtensions);
const embedPattern = /!\[\[([^\]]+)\]\]/g;

export default function remarkObsidianEmbeds(options = {}) {
  const assetBaseUrl = options.assetBaseUrl ?? defaultAssetBaseUrl;
  const assetsDir = options.assetsDir ? resolve(options.assetsDir) : null;

  return function transform(tree) {
    transformChildren(tree, { assetBaseUrl, assetsDir });
  };
}

function transformChildren(parent, options) {
  if (!Array.isArray(parent.children)) {
    return;
  }

  parent.children = parent.children.flatMap((child) => {
    const blockEmbed = parseBlockEmbed(child, options);

    if (blockEmbed) {
      return [blockEmbed];
    }

    if (child.type === 'text') {
      return splitTextNode(child, options);
    }

    transformChildren(child, options);
    return [child];
  });
}

function parseBlockEmbed(node, options) {
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

  return {
    type: 'html',
    value: renderImageHtml(image),
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
  const src = toAssetUrl(target, options);

  if (!src) {
    return null;
  }

  return {
    src,
    alt: cleanAltText(explicitAlt ?? basenameWithoutKnownExtension(target)),
    width: dimensions?.width,
    height: dimensions?.height,
  };
}

function toAssetUrl(target, { assetBaseUrl, assetsDir }) {
  const extension = extname(target).toLowerCase();
  let publicPath = target;

  if (extension === '.excalidraw') {
    publicPath = resolveExcalidrawExportPath(target, assetsDir);
  } else if (!directImageExtensions.has(extension)) {
    return null;
  }

  return `${assetBaseUrl.replace(/\/?$/, '/')}${encodePath(publicPath)}`;
}

function resolveExcalidrawExportPath(target, assetsDir) {
  const withoutExtension = target.slice(0, -extname(target).length);

  if (assetsDir) {
    for (const extension of webImageExtensions) {
      const candidate = `${withoutExtension}${extension}`;

      if (existsSync(resolve(assetsDir, candidate))) {
        return candidate;
      }
    }
  }

  return `${withoutExtension}.svg`;
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

function renderImageHtml(image) {
  const attributes = [
    ['src', image.src],
    ['alt', image.alt],
    ['width', image.width],
    ['height', image.height],
    ['loading', 'lazy'],
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

  if (extension.toLowerCase() === '.excalidraw' || directImageExtensions.has(extension.toLowerCase())) {
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
