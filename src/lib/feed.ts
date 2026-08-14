import { getCollection } from 'astro:content';

export interface FeedItem {
  title: string;
  pubDate: Date;
  link: string;
}

async function getProjectFeedItems(site: URL): Promise<FeedItem[]> {
  const projects = await getCollection('projects');

  return projects
    .filter((project) => ['completed', 'ongoing'].includes(project.data.status))
    .map((project) => ({
      title: project.data.title,
      pubDate: project.data.date,
      link: new URL(`/projects/${project.id}/`, site).href,
    }));
}

export async function getFeedItems(site: URL): Promise<FeedItem[]> {
  const projectItems = await getProjectFeedItems(site);

  // Future content sources, such as posts, can normalize into FeedItem[] here.
  return [...projectItems].sort(
    (a, b) => b.pubDate.getTime() - a.pubDate.getTime(),
  );
}
