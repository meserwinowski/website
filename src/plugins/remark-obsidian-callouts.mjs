/**
 * remark-obsidian-callouts.mjs — Translate Obsidian callouts into semantic HTML.
 *
 * This is a remark plugin, so it runs on the markdown AST (mdast) before Astro
 * turns markdown into HTML. Obsidian writes callouts as special blockquotes; the
 * plugin upgrades those nodes into `<aside>` / `<details>` elements that the
 * prose CSS can style without adding callout logic to page components.
 */

// Obsidian callout markers at the start of the first blockquote line:
// [!tip] Title, [!info]+ Expanded, [!note]- Collapsed.
const calloutMarkerPattern = /^\[!([a-z][\w-]*)\]([+-])?[ \t]*/i;

const calloutLabels = {
  abstract: 'Abstract',
  bug: 'Bug',
  caution: 'Caution',
  check: 'Check',
  danger: 'Danger',
  error: 'Error',
  example: 'Example',
  failure: 'Failure',
  faq: 'FAQ',
  help: 'Help',
  hint: 'Hint',
  important: 'Important',
  info: 'Info',
  missing: 'Missing',
  note: 'Note',
  question: 'Question',
  quote: 'Quote',
  success: 'Success',
  summary: 'Summary',
  tldr: 'TL;DR',
  tip: 'Tip',
  todo: 'Todo',
  warning: 'Warning',
};

/**
 * Create the remark plugin Astro uses in the unified markdown pipeline.
 *
 * A unified plugin returns a transformer; the transformer receives the mdast
 * root and may mutate or replace nodes before rehype converts them to HTML.
 */
export default function remarkObsidianCallouts() {
  // remark plugin signature: return a transformer that mutates the mdast tree.
  return function transform(tree) {
    transformChildren(tree);
  };
}

/**
 * Walk a node's children depth-first and replace callout blockquotes in place.
 *
 * The recursion happens before transforming the current node so nested callouts
 * inside lists or other containers are normalized wherever they appear.
 */
function transformChildren(parent) {
  if (!Array.isArray(parent.children)) {
    return;
  }

  parent.children = parent.children.map((child) => {
    transformChildren(child);

    // Only blockquotes can be Obsidian callouts.
    if (child.type !== 'blockquote') {
      return child;
    }

    return transformBlockquote(child);
  });
}

/**
 * Convert one blockquote into callout HTML when its first inline text is a marker.
 *
 * Non-callout blockquotes are returned unchanged. Collapsible Obsidian markers
 * (`+` or `-`) become native `<details>` elements; plain callouts become
 * `<aside>` landmarks.
 */
function transformBlockquote(blockquote) {
  const firstChild = blockquote.children?.[0];

  if (firstChild?.type !== 'paragraph' || !Array.isArray(firstChild.children)) {
    return blockquote;
  }

  const marker = parseCalloutMarker(firstChild.children);

  if (!marker) {
    return blockquote;
  }

  const { titleNodes, bodyNodes } = splitCalloutBody(marker.inlineNodes);
  // If there is no explicit title after the marker, use Obsidian-style defaults
  // (e.g. [!tip] -> "Tip", [!warning] -> "Warning").
  const titleChildren = titleNodes.length > 0 ? titleNodes : [{ type: 'text', value: calloutLabels[marker.type] ?? marker.type }];
  const contentChildren = [...bodyNodes, ...blockquote.children.slice(1)];
  const isCollapsible = Boolean(marker.fold);

  if (isCollapsible) {
    return createElementNode('details', createCalloutProperties(marker, ['callout-collapsible'], marker.fold === '+'), [
      createElementNode('summary', { className: ['callout-title'] }, [
        createElementNode('span', { className: ['callout-title-text'] }, titleChildren),
      ]),
      createElementNode('div', { className: ['callout-content'] }, [
        createElementNode('div', { className: ['callout-content-inner'] }, contentChildren),
      ]),
    ]);
  }

  return createElementNode('aside', createCalloutProperties(marker), [
    createElementNode('div', { className: ['callout-title'] }, [
      createElementNode('span', { className: ['callout-title-text'] }, titleChildren),
    ]),
    createElementNode('div', { className: ['callout-content'] }, contentChildren),
  ]);
}

/**
 * Read and remove the `[!type]` marker from the first text node of a paragraph.
 *
 * The returned inline nodes keep the remaining title/body content, while the
 * marker metadata is stored separately for class names and collapsible state.
 */
function parseCalloutMarker(children) {
  if (children[0]?.type !== 'text') {
    return null;
  }

  const match = children[0].value.match(calloutMarkerPattern);

  if (!match) {
    return null;
  }

  // Strip the marker from the first text node so downstream content rendering
  // sees only the title/body text.
  const firstText = cloneNode(children[0]);
  firstText.value = firstText.value.slice(match[0].length);
  const inlineNodes = firstText.value ? [firstText, ...cloneNodes(children.slice(1))] : cloneNodes(children.slice(1));

  return {
    type: match[1].toLowerCase(),
    fold: match[2],
    inlineNodes,
  };
}

/**
 * Split the inline content after a marker into callout title nodes and body nodes.
 *
 * Obsidian treats the first line after `[!type]` as the optional title. Anything
 * after a hard break or embedded newline becomes the first paragraph of body
 * content, followed by the rest of the original blockquote children.
 */
function splitCalloutBody(inlineNodes) {
  const titleNodes = [];
  const bodyInlineNodes = [];
  let foundBreak = false;

  for (const node of inlineNodes) {
    if (foundBreak) {
      bodyInlineNodes.push(node);
      continue;
    }

    // Hard line break means "title is done; body starts now".
    if (node.type === 'break') {
      foundBreak = true;
      continue;
    }

    // Some markdown forms preserve the newline in a text node instead of a
    // separate break node, so split that text manually.
    if (node.type === 'text' && node.value.includes('\n')) {
      const [before, ...afterParts] = node.value.split('\n');

      if (before.trimEnd()) {
        titleNodes.push({ ...node, value: before.trimEnd() });
      }

      const after = afterParts.join('\n').trimStart();

      if (after) {
        bodyInlineNodes.push({ ...node, value: after });
      }

      foundBreak = true;
      continue;
    }

    titleNodes.push(node);
  }

  return {
    titleNodes: trimTextNodes(titleNodes),
    bodyNodes: bodyInlineNodes.length > 0 ? [{ type: 'paragraph', children: trimTextNodes(bodyInlineNodes) }] : [],
  };
}

/**
 * Build HTML attributes for the callout wrapper.
 *
 * mdast stores HTML attributes under camel-cased `hProperties`; the renderer
 * serializes `dataCallout` back to `data-callout` in the final markup.
 */
function createCalloutProperties(marker, extraClassNames = [], open = false) {
  const properties = {
    className: ['callout', `callout-${marker.type}`, ...extraClassNames],
    // `data-callout` is consumed by CSS selectors (serialized from `dataCallout`).
    dataCallout: marker.type,
  };

  if (open) {
    properties.open = true;
  }

  return properties;
}

/**
 * Create an mdast node that will become a specific HTML element.
 *
 * Custom mdast node types are fine as long as `data.hName` / `data.hProperties`
 * tell the mdast-to-hast bridge what real HTML to emit.
 */
function createElementNode(tagName, properties, children) {
  // hName/hProperties tell mdast -> hast conversion which real HTML element
  // to emit. The custom `type` value is just an internal label.
  return {
    type: `obsidianCallout${capitalize(tagName)}`,
    data: {
      hName: tagName,
      hProperties: properties,
    },
    children,
  };
}

/**
 * Trim whitespace-only text nodes from the edges of an inline node list.
 *
 * This keeps generated titles and body paragraphs stable while preserving
 * intentional internal spacing and inline formatting nodes.
 */
function trimTextNodes(nodes) {
  // Normalize leading/trailing whitespace so generated title/body markup is
  // predictable (important for tests and for avoiding odd spacing in HTML).
  const trimmed = cloneNodes(nodes);

  while (trimmed[0]?.type === 'text' && trimmed[0].value.trim() === '') {
    trimmed.shift();
  }

  while (trimmed.at(-1)?.type === 'text' && trimmed.at(-1).value.trim() === '') {
    trimmed.pop();
  }

  if (trimmed[0]?.type === 'text') {
    trimmed[0].value = trimmed[0].value.trimStart();
  }

  if (trimmed.at(-1)?.type === 'text') {
    trimmed[trimmed.length - 1].value = trimmed.at(-1).value.trimEnd();
  }

  return trimmed;
}

/** Clone a list of mdast nodes so title/body reshaping never mutates originals. */
function cloneNodes(nodes) {
  return nodes.map(cloneNode);
}

/**
 * Deep-clone a plain mdast node.
 *
 * The nodes handled here are JSON-shaped data (no functions or cycles), so JSON
 * serialization is a small, dependency-free clone strategy.
 */
function cloneNode(node) {
  return JSON.parse(JSON.stringify(node));
}

/** Uppercase the first character for readable custom node type names. */
function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
