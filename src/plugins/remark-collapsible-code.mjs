/**
 * remark-collapsible-code.mjs — Turn ```lang fold:Title code fences into
 * collapsible <details> disclosures.
 *
 * This is a remark plugin, so it runs on the markdown AST (mdast) before Astro
 * converts markdown to HTML. Obsidian writes foldable code blocks by adding a
 * `fold:` token to the fence info string (e.g. ```yaml fold:compose.yaml). The
 * plugin upgrades those `code` nodes into a `<details>` wrapper whose `<summary>`
 * shows the fold title (usually a filename) and whose body still contains the
 * original `code` node.
 *
 * Because the code node is left untouched inside the wrapper, Astro's Shiki
 * syntax highlighter — which runs later as a rehype plugin on the whole HTML
 * tree — still highlights it exactly as it would a top-level fence. The smooth
 * open/close animation is shared with collapsible callouts via
 * CollapsibleDetails.astro (its selector includes `.code-collapsible`).
 */

// Matches a `fold` token in the fence info string, with an optional `:title`.
// The surrounding whitespace group is preserved on replace so the rest of the
// meta (e.g. Shiki line-highlight ranges) stays intact.
const foldMetaPattern = /(^|\s)fold(?::(\S+))?(?=\s|$)/i;

/**
 * Create the remark plugin Astro uses in the unified markdown pipeline.
 *
 * A unified plugin returns a transformer; the transformer receives the mdast
 * root and may mutate or replace nodes before rehype converts them to HTML.
 */
export default function remarkCollapsibleCode() {
  return function transform(tree) {
    transformChildren(tree);
  };
}

/**
 * Walk a node's children depth-first and replace foldable code fences in place.
 *
 * Recursing before transforming the current node keeps folds working wherever a
 * fence appears (e.g. inside a list item or blockquote), not just at the top level.
 */
function transformChildren(parent) {
  if (!Array.isArray(parent.children)) {
    return;
  }

  parent.children = parent.children.map((child) => {
    transformChildren(child);

    // Only fenced code blocks can carry a fold marker.
    if (child.type !== 'code') {
      return child;
    }

    return transformCode(child);
  });
}

/**
 * Wrap one code fence in collapsible <details> markup when it carries a fold marker.
 *
 * Non-folded fences are returned unchanged. The fold marker is stripped from the
 * fence meta so downstream tooling (e.g. Shiki) never sees the custom token.
 */
function transformCode(code) {
  const meta = typeof code.meta === 'string' ? code.meta : '';
  const match = meta.match(foldMetaPattern);

  if (!match) {
    return code;
  }

  // Title precedence: explicit `fold:Title`, then the language, then a generic
  // label so the summary never renders empty.
  const title = (match[2] ?? code.lang ?? 'Code').trim() || 'Code';

  // Remove the fold token but keep any remaining meta intact.
  const cleanedMeta = meta.replace(foldMetaPattern, '$1').trim();
  const codeNode = { ...code, meta: cleanedMeta.length > 0 ? cleanedMeta : null };

  return createElementNode('details', { className: ['code-collapsible'] }, [
    createElementNode('summary', { className: ['code-collapsible-title'] }, [
      createElementNode('span', { className: ['code-collapsible-title-text'] }, [
        { type: 'text', value: title },
      ]),
    ]),
    createElementNode('div', { className: ['code-collapsible-content'] }, [codeNode]),
  ]);
}

/**
 * Create an mdast node that will become a specific HTML element.
 *
 * `data.hName` / `data.hProperties` tell the mdast-to-hast bridge which real
 * HTML element and attributes to emit; the custom `type` is just an internal label.
 */
function createElementNode(tagName, properties, children) {
  return {
    type: `collapsibleCode${capitalize(tagName)}`,
    data: {
      hName: tagName,
      hProperties: properties,
    },
    children,
  };
}

/** Uppercase the first character for readable custom node type names. */
function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
