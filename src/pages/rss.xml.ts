import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getFeedItems } from '../lib/feed';

export const GET: APIRoute = async ({ site }) => {
  if (!site) {
    throw new Error('RSS generation requires the canonical site URL.');
  }

  return rss({
    title: 'Matt Serwinowski',
    description: 'Projects and writing by Matt Serwinowski.',
    site,
    items: await getFeedItems(site),
    customData: '<language>en-us</language>',
  });
};
