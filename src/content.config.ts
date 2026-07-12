/**
 * content.config.ts — Typed content collections for vault-synced markdown.
 *
 * Astro's Content Layer scans files with loaders, validates their frontmatter
 * with Zod, then gives pages typed entries from `getCollection()` / `render()`.
 * The markdown under `src/content/` is generated from Obsidian, so this schema
 * is the contract the vault frontmatter must satisfy.
 */
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Project notes power project cards and detail pages.
 *
 * `glob()` is Astro's filesystem loader: it turns matching markdown files into
 * collection entries, while the Zod object documents and enforces each field.
 */
const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    // Draft-like statuses can exist in the vault; page generation filters to
    // `completed` and `ongoing` so ideas do not publish accidentally.
    status: z.enum(['completed', 'ongoing', 'planning', 'draft']),
    tags: z.array(z.string()),
    // `nullish()` accepts either an omitted value or explicit `null` from YAML.
    thumbnail: z.string().nullish(),
    // Coercion lets authors write normal YAML date strings while pages receive
    // real Date objects.
    date: z.coerce.date(),
    repo: z.string().url().optional(),
  }),
});

/**
 * Freeform pages (About, etc.) use a smaller schema because their layout is
 * driven by page components rather than project metadata.
 */
const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    heroName: z.string().optional(),
    heroTagline: z.string().optional(),
  }),
});

/** Collection registry exported for Astro's content layer bootstrap. */
export const collections = { projects, pages };
