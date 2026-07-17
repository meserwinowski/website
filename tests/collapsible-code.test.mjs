/**
 * collapsible-code.test.mjs — Unit tests for foldable code fences.
 *
 * The site uses a custom remark plugin to turn ```lang fold:Title code fences
 * into collapsible <details> disclosures, reusing the same open/close animation
 * as the Obsidian callouts. Like the callout tests, these work at the markdown
 * AST level rather than against source strings, keeping them focused on the
 * plugin contract Astro relies on during build.
 */
import { describe, expect, it } from 'vitest';
import remarkCollapsibleCode from '../src/plugins/remark-collapsible-code.mjs';

/** Build a minimal mdast root wrapping a single code node fixture. */
function rootWith(code) {
  return { type: 'root', children: [code] };
}

describe('Collapsible code fences', () => {
  it('wraps a fold-tagged fence in a collapsible details element', () => {
    const tree = rootWith({
      type: 'code',
      lang: 'yaml',
      meta: 'fold:compose.yaml',
      value: 'services:\n  web:\n    image: nginx:alpine',
    });

    remarkCollapsibleCode()(tree);

    const details = tree.children[0];
    expect(details.data.hName).toBe('details');
    expect(details.data.hProperties).toEqual({ className: ['code-collapsible'] });

    const summary = details.children[0];
    expect(summary.data.hName).toBe('summary');
    expect(summary.children[0].data.hName).toBe('span');
    expect(summary.children[0].data.hProperties).toEqual({ className: ['code-collapsible-title-text'] });
    expect(summary.children[0].children[0]).toEqual({ type: 'text', value: 'compose.yaml' });

    const content = details.children[1];
    expect(content.data.hName).toBe('div');
    expect(content.data.hProperties).toEqual({ className: ['code-collapsible-content'] });
    // The original code node is preserved (so Shiki still highlights it), with
    // the fold token stripped from its meta.
    expect(content.children[0].type).toBe('code');
    expect(content.children[0].lang).toBe('yaml');
    expect(content.children[0].value).toContain('nginx:alpine');
    expect(content.children[0].meta).toBeNull();
  });

  it('leaves ordinary code fences untouched', () => {
    const tree = rootWith({ type: 'code', lang: 'bash', meta: null, value: 'npm run build' });

    remarkCollapsibleCode()(tree);

    expect(tree.children[0].type).toBe('code');
    expect(tree.children[0].data).toBeUndefined();
  });

  it('falls back to the language as the title for a bare fold token', () => {
    const tree = rootWith({ type: 'code', lang: 'json', meta: 'fold', value: '{}' });

    remarkCollapsibleCode()(tree);

    const titleText = tree.children[0].children[0].children[0];
    expect(titleText.children[0]).toEqual({ type: 'text', value: 'json' });
  });

  it('uses a generic title when neither a fold title nor a language is present', () => {
    const tree = rootWith({ type: 'code', lang: null, meta: 'fold', value: 'plain text' });

    remarkCollapsibleCode()(tree);

    const titleText = tree.children[0].children[0].children[0];
    expect(titleText.children[0]).toEqual({ type: 'text', value: 'Code' });
  });

  it('keeps other meta tokens when stripping the fold marker', () => {
    const tree = rootWith({ type: 'code', lang: 'ts', meta: '{1,3} fold:app.ts', value: 'const a = 1;' });

    remarkCollapsibleCode()(tree);

    const codeNode = tree.children[0].children[1].children[0];
    expect(codeNode.meta).toBe('{1,3}');
  });
});
