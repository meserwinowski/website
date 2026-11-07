import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface PageImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface GiftPageData {
  slug: string;
  entry: string;
  title: string;
  description: string;
  date: string;
  heading: string;
  tagline: string;
  media: PageImage;
  imagesLabel: string;
  images: PageImage[];
}

interface SiteData {
  name: string;
  fullName: string;
  wordmark: string;
  description: string;
  homeDescription: string;
  projectsDescription: string;
  feedDescription: string;
  aboutTagline: string;
  publishedPages: string[];
  archivePages: GiftPageData[];
}

let data: SiteData;
try {
  data = JSON.parse(readFileSync(resolve(process.cwd(), '.site-content/site.json'), 'utf8'));
} catch {
  throw new Error(
    'Site inputs are missing or invalid. Run npm run demo (public examples) or npm run sync (private production content).'
  );
}
export const siteData = data;
