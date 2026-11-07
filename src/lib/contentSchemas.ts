import { z } from 'astro/zod';
import { projectStatuses } from './projectStatus.ts';

export const projectSchema = z.object({
  title: z.string(),
  description: z.string(),
  status: z.enum(projectStatuses),
  tags: z.array(z.string()),
  thumbnail: z.string().nullish(),
  date: z.coerce.date(),
  repo: z.string().url().nullish(),
});

export const pageSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  heroName: z.string().optional(),
  heroTagline: z.string().optional(),
});
