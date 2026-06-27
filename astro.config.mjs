import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import remarkObsidianCallouts from './src/plugins/remark-obsidian-callouts.mjs';
import remarkObsidianEmbeds from './src/plugins/remark-obsidian-embeds.mjs';

const projectDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  site: 'https://www.mattserwinowski.com',
  integrations: [sitemap()],
  markdown: {
    processor: unified({
      remarkPlugins: [
        remarkObsidianCallouts,
        [
          remarkObsidianEmbeds,
          {
            assetsDir: resolve(projectDir, 'public', 'images'),
            contentRoot: resolve(projectDir, 'src', 'content'),
          },
        ],
      ],
    }),
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      tsconfigPaths: true,
    },
  },
});
