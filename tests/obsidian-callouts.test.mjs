/**
 * obsidian-callouts.test.mjs — Unit tests for Obsidian callout markdown.
 *
 * The site uses a custom remark plugin to turn Obsidian blockquotes like
 * `> [!tip]` into styled HTML structures. These tests work at the markdown AST
 * level rather than against source markdown strings, which keeps them focused
 * on the plugin contract Astro relies on during build.
 *
 * In Vitest, `describe` groups the plugin behavior, each `it` names one
 * markdown shape a writer might use, and `expect` verifies the AST properties
 * that the later HTML serializer will turn into elements/classes. The small
 * object literals are fixtures: deliberately minimal inputs that exercise one
 * behavior at a time.
 */
import { describe, expect, it } from 'vitest';
import remarkObsidianCallouts from '../src/plugins/remark-obsidian-callouts.mjs';

describe('Obsidian callout rendering', () => {
  it('converts a folded Obsidian callout into a collapsible details element', () => {
    // Arrange: a minimal mdast blockquote matching Obsidian's folded callout
    // syntax. Using an AST fixture avoids coupling the test to a markdown parser.
    const tree = {
      type: 'root',
      children: [
        {
          type: 'blockquote',
          children: [
            {
              type: 'paragraph',
              children: [
                { type: 'text', value: '[!example]- ' },
                { type: 'emphasis', children: [{ type: 'text', value: 'Title - I ask myself these things on occasion.' }] },
                { type: 'text', value: '\nI think theres an argument to be made for either side.' },
              ],
            },
          ],
        },
      ],
    };

    // Act: remark plugins mutate the tree in place, so the assertions inspect
    // the same object after transformation.
    remarkObsidianCallouts()(tree);

    expect(tree.children[0].data.hName).toBe('details');
    expect(tree.children[0].data.hProperties).toEqual({
      className: ['callout', 'callout-example', 'callout-collapsible'],
      dataCallout: 'example',
    });
    expect(tree.children[0].children[0].data.hName).toBe('summary');
    expect(tree.children[0].children[0].children[0].data.hName).toBe('span');
    expect(tree.children[0].children[0].children[0].children[0].type).toBe('emphasis');
    expect(tree.children[0].children[1].data.hName).toBe('div');
    expect(tree.children[0].children[1].children[0].data.hName).toBe('div');
    expect(tree.children[0].children[1].children[0].data.hProperties).toEqual({
      className: ['callout-content-inner'],
    });
    expect(tree.children[0].children[1].children[0].children[0].children[0].value).toBe(
      'I think theres an argument to be made for either side.',
    );
  });

  it('uses the callout type as the title when no explicit title is provided', () => {
    // No explicit title means the plugin supplies a reader-friendly default
    // instead of leaving an empty callout header in the rendered page.
    const tree = {
      type: 'root',
      children: [
        {
          type: 'blockquote',
          children: [
            {
              type: 'paragraph',
              children: [
                { type: 'text', value: '[!tip]\nPick a budget first.' },
              ],
            },
          ],
        },
      ],
    };

    remarkObsidianCallouts()(tree);

    expect(tree.children[0].data.hName).toBe('aside');
    expect(tree.children[0].children[0].children[0].data.hName).toBe('span');
    expect(tree.children[0].children[0].children[0].children[0]).toEqual({ type: 'text', value: 'Tip' });
    expect(tree.children[0].children[1].children[0].children[0].value).toBe('Pick a budget first.');
  });

  it('keeps linked callout titles inline inside one title text wrapper', () => {
    // Callout titles can contain inline markdown, so this fixture protects the
    // wrapper structure that keeps links/emphasis inside the visible title.
    const tree = {
      type: 'root',
      children: [
        {
          type: 'blockquote',
          children: [
            {
              type: 'paragraph',
              children: [
                { type: 'text', value: '[!info]- ' },
                {
                  type: 'link',
                  url: 'https://en.wikipedia.org/wiki/Balanced_audio',
                  children: [{ type: 'text', value: 'Balanced audio' }],
                },
                { type: 'text', value: ' is actually a really cool electrical engineering concept.' },
              ],
            },
          ],
        },
      ],
    };

    remarkObsidianCallouts()(tree);

    const titleText = tree.children[0].children[0].children[0];
    expect(titleText.data.hName).toBe('span');
    expect(titleText.data.hProperties).toEqual({ className: ['callout-title-text'] });
    expect(titleText.children[0].type).toBe('link');
    expect(titleText.children[1].value).toContain('is actually');
  });

  it('uses TL;DR as the default title for tldr callouts', () => {
    // Alias-specific labels are part of the writing experience: `tldr` should
    // render as the conventional "TL;DR" rather than the mechanically cased type.
    const tree = {
      type: 'root',
      children: [
        {
          type: 'blockquote',
          children: [
            {
              type: 'paragraph',
              children: [
                { type: 'text', value: '[!tldr]\nQuick summary.' },
              ],
            },
          ],
        },
      ],
    };

    remarkObsidianCallouts()(tree);

    expect(tree.children[0].data.hName).toBe('aside');
    expect(tree.children[0].data.hProperties).toEqual({
      className: ['callout', 'callout-tldr'],
      dataCallout: 'tldr',
    });
    expect(tree.children[0].children[0].children[0].children[0]).toEqual({ type: 'text', value: 'TL;DR' });
  });
});
