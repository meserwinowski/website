/**
 * Content collection definitions for the site.
 * Uses Astro's Content Layer API to define typed schemas for Markdown content.
 */
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    status: z.enum(['done', 'ongoing', 'planning', 'idea']),
    tags: z.array(z.string()),
    thumbnail: z.string().nullish(),
    date: z.coerce.date(),
    repo: z.string().url().optional(),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    heroName: z.string().optional(),
    heroTagline: z.string().optional(),
  }),
});

export const collections = { projects, pages };
