/**
 * content.config.ts — Typed content collections for vault-synced markdown.
 *
 * Astro's Content Layer scans files with loaders, validates their frontmatter
 * with Zod, then gives pages typed entries from `getCollection()` / `render()`.
 * The ignored markdown under `src/content/` is assembled from private exports
 * or explicit synthetic fixtures. The shared schemas also validate every vault
 * note during export, including unpublished drafts.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { pageSchema, projectSchema } from './lib/contentSchemas';

/**
 * Project notes power project cards and detail pages.
 *
 * `glob()` is Astro's filesystem loader: it turns matching markdown files into
 * collection entries, while the Zod object documents and enforces each field.
 */
const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: projectSchema,
});

/**
 * Freeform pages (About, etc.) use a smaller schema because their layout is
 * driven by page components rather than project metadata.
 */
const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: pageSchema,
});

/** Collection registry exported for Astro's content layer bootstrap. */
export const collections = { projects, pages };
