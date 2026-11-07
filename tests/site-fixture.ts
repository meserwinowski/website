import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readNote } from '../scripts/content-pipeline.mjs';
import { siteData } from '../src/lib/siteData';
import { isPublicProject } from '../src/lib/projectStatus';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';

export { siteData };
export const htmlEscape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!
  );

const contentRoot = resolve('src/content');
export const publicProjects = readdirSync(resolve(contentRoot, 'projects'), { recursive: true })
  .filter((name) => String(name).endsWith('.md'))
  .map((name) => ({
    id: String(name).replace(/\.md$/, ''),
    ...readNote(resolve(contentRoot, 'projects', String(name))),
  }))
  .filter((project) => isPublicProject(project.data.status))
  .sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime());

export const firstProject = publicProjects[0];
const processor = await createMarkdownProcessor();
export const projectHeadings = (await processor.render(firstProject.body)).metadata.headings;
export const gift = siteData.archivePages[0];
export const giftNote = readNote(resolve(contentRoot, 'pages', `${gift.entry}.md`));
export const cardManifest = JSON.parse(
  readFileSync(resolve('.site-content/.card-thumbnails.json'), 'utf8')
);
