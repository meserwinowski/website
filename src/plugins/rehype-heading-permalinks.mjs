/**
 * rehype-heading-permalinks.mjs — Add accessible self-links to article headings.
 *
 * This is a rehype plugin, so it runs on the HTML AST (hast) after remark has
 * produced HTML-shaped nodes. `rehypeHeadingIds` creates heading ids first; this
 * plugin appends a small anchor that lets readers copy section links.
 */
const headingPattern = /^h([1-2])$/;

/**
 * Create the rehype plugin used by Astro's unified markdown pipeline.
 *
 * Rehype transformers receive hast nodes, whose `element` nodes correspond to
 * actual HTML tags and attributes.
 */
export default function rehypeHeadingPermalinks() {
  // rehype plugin: walk the rendered HTML tree and append a permalink anchor
  // to each heading that already has an id.
  return function transform(tree) {
    addPermalinks(tree);
  };
}

/**
 * Walk the hast tree and attach permalinks to eligible headings.
 *
 * The traversal is intentionally small and dependency-free because the tree
 * shape needed here is simple: each node may have a `children` array.
 */
function addPermalinks(node) {
  if (!node || !Array.isArray(node.children)) {
    return;
  }

  for (const child of node.children) {
    if (isPermalinkableHeading(child)) {
      attachPermalink(child);
    }

    // Depth-first traversal so headings are handled regardless of nesting.
    addPermalinks(child);
  }
}

/**
 * Decide whether a hast node is an h1/h2 with an id to link to.
 *
 * Lower-level headings are left alone to keep visual noise down in long prose.
 */
function isPermalinkableHeading(node) {
  if (node?.type !== 'element' || typeof node.tagName !== 'string') {
    return false;
  }

  if (!headingPattern.test(node.tagName)) {
    return false;
  }

  const id = node.properties?.id;
  return typeof id === 'string' && id.length > 0;
}

/**
 * Append the permalink anchor unless one already exists.
 *
 * The link is visible but labeled for assistive technology with the section's
 * text, so screen-reader users hear a useful destination instead of just "link".
 */
function attachPermalink(heading) {
  const headingId = heading.properties.id;

  if (hasPermalink(heading.children, headingId)) {
    return;
  }

  // Use visible heading text for screen readers; fall back to id if needed.
  const label = `Link to section: ${getTextContent(heading).trim() || headingId}`;
  heading.children.push({
    type: 'element',
    tagName: 'a',
    properties: {
      href: `#${headingId}`,
      className: ['heading-permalink'],
      'aria-label': label,
      'data-heading-permalink': 'true',
    },
    children: [
      {
        type: 'text',
        value: '🔗',
      },
    ],
  });
}

/**
 * Detect an existing permalink added by this plugin.
 *
 * This keeps the transform idempotent, which is useful if markdown is processed
 * more than once in development or tests.
 */
function hasPermalink(children, headingId) {
  if (!Array.isArray(children)) {
    return false;
  }

  return children.some((child) => (
    child?.type === 'element'
      && child.tagName === 'a'
      // Support both kebab and camel-case property keys because different
      // AST conversion steps can normalize attribute names differently.
      && (
        child.properties?.['data-heading-permalink'] === 'true'
        || child.properties?.dataHeadingPermalink === 'true'
      )
      && child.properties?.href === `#${headingId}`
  ));
}

/**
 * Collect plain text from a heading subtree for the aria-label.
 *
 * Inline emphasis, code, and other child elements can split heading text across
 * nested nodes, so this recursively joins all text descendants.
 */
function getTextContent(node) {
  // Collects nested text so headings with inline emphasis/code still produce a
  // useful aria-label.
  if (!node) {
    return '';
  }

  if (node.type === 'text') {
    return node.value ?? '';
  }

  if (!Array.isArray(node.children)) {
    return '';
  }

  return node.children.map(getTextContent).join('');
}
