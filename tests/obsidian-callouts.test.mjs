import { describe, expect, it } from 'vitest';
import remarkObsidianCallouts from '../src/plugins/remark-obsidian-callouts.mjs';

describe('Obsidian callout rendering', () => {
  it('converts a folded Obsidian callout into a collapsible details element', () => {
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
    expect(tree.children[0].children[1].children[0].children[0].value).toBe(
      'I think theres an argument to be made for either side.',
    );
  });

  it('uses the callout type as the title when no explicit title is provided', () => {
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
});
