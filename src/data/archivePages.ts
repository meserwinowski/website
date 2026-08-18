export interface ArchivePageEntry {
  slug: string;
  title: string;
  description: string;
  date: Date;
}

/**
 * Register concrete Astro pages moved into `src/pages/archive/` so the archive
 * index can list them alongside archived projects.
 */
export const archivePages: readonly ArchivePageEntry[] = [];

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
