/**
 * astro.config.mjs — Build-time wiring for Astro, Tailwind, and markdown.
 *
 * Astro uses `unified()` for markdown. In this project we replace the default
 * processor so Obsidian syntax is handled in one pipeline: remark plugins edit
 * the markdown AST (mdast), then rehype plugins edit the HTML AST (hast).
 */
import { defineConfig } from 'astro/config';
import { rehypeHeadingIds, unified } from '@astrojs/markdown-remark';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import remarkObsidianCallouts from './src/plugins/remark-obsidian-callouts.mjs';
import remarkObsidianEmbeds from './src/plugins/remark-obsidian-embeds.mjs';
import rehypeHeadingPermalinks from './src/plugins/rehype-heading-permalinks.mjs';

/** ESM equivalent of `__dirname`, used to pass absolute paths to plugins. */
const projectDir = dirname(fileURLToPath(import.meta.url));

/**
 * Main Astro configuration.
 *
 * `defineConfig()` gives editor type hints and lets Astro validate integration,
 * markdown, and Vite options before the site is built.
 */
export default defineConfig({
  site: 'https://www.mattserwinowski.com',
  integrations: [sitemap()],
  markdown: {
    // Replaces Astro's stock markdown stack; all Obsidian callout/embed handling
    // lives in these plugins so page components can render normal HTML.
    processor: unified({
      remarkPlugins: [
        remarkObsidianCallouts,
        [
          remarkObsidianEmbeds,
          {
            // The embed plugin resolves synced vault assets from disk so it can
            // emit stable URLs plus intrinsic image metadata.
            assetsDir: resolve(projectDir, 'public', 'images'),
            contentRoot: resolve(projectDir, 'src', 'content'),
          },
        ],
      ],
      // Heading ids are created first, then the custom plugin appends visible
      // self-links to those headings.
      rehypePlugins: [rehypeHeadingIds, rehypeHeadingPermalinks],
    }),
  },
  vite: {
    // Tailwind CSS v4 runs as a Vite plugin rather than Astro's old v3 adapter.
    plugins: [tailwindcss()],
    resolve: {
      // Let Vite honor path aliases from tsconfig if they are added later.
      tsconfigPaths: true,
    },
  },
});
