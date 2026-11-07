export interface ArchivePageEntry {
  slug: string;
  title: string;
  description: string;
  date: Date;
}

/**
 * Share standalone archive metadata between dynamic routes and the archive index.
 */
export const archivePages = siteData.archivePages.map((page) => ({
  ...page,
  date: new Date(page.date),
}));

export function validateArchiveSlugs(projectSlugs: string[]): void {
  const pageSlugs = new Set<string>();

  for (const page of archivePages) {
    if (pageSlugs.has(page.slug)) {
      throw new Error(`Duplicate standalone archive slug: ${page.slug}`);
    }
    pageSlugs.add(page.slug);
  }

  for (const projectSlug of projectSlugs) {
    if (pageSlugs.has(projectSlug)) {
      throw new Error(`Archive slug is used by both a page and project: ${projectSlug}`);
    }
  }
}
import { siteData } from '../lib/siteData';
