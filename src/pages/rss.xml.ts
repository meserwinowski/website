import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getFeedItems } from '../lib/feed';
import { siteData } from '../lib/siteData';

export const GET: APIRoute = async ({ site }) => {
  if (!site) {
    throw new Error('RSS generation requires the canonical site URL.');
  }

  return rss({
    title: siteData.name,
    description: siteData.feedDescription,
    site,
    items: await getFeedItems(site),
    customData: '<language>en-us</language>',
  });
};
