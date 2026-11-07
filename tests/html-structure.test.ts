/**
 * html-structure.test.ts — Structural checks for the built pages.
 *
 * These tests read `dist/` instead of `src/` because users and crawlers only see
 * the static HTML emitted by Astro. Source components can compile yet still
 * produce missing headings, wrong titles, absent widgets, or broken layout
 * variables; asserting the built artifact catches those regressions at the
 * contract boundary.
 *
 * Vitest's `beforeAll` loads shared fixtures once, `describe` scopes the checks
 * by page or feature, `it` names the behavior being protected, and `expect`
 * verifies the rendered markup. The regular expressions are intentionally simple
 * structural probes, not full HTML parsing.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { firstProject, gift, giftNote, htmlEscape, siteData, cardManifest, projectHeadings } from './site-fixture';

const distDir = resolve(import.meta.dirname, '..', 'dist');
let indexHtml: string;
let projectsHtml: string;
let postsHtml: string;
let aboutHtml: string;
let archivedDadHtml: string;
let archiveHtml: string;

beforeAll(() => {
  // Arrange once: load the built HTML fixtures that every assertion inspects.
  // `npm test` performs the build first, so this suite should never invoke Astro itself.
  indexHtml = readFileSync(resolve(distDir, 'index.html'), 'utf-8');
  projectsHtml = readFileSync(resolve(distDir, 'projects', 'index.html'), 'utf-8');
  postsHtml = readFileSync(resolve(distDir, 'posts', 'index.html'), 'utf-8');
  aboutHtml = readFileSync(resolve(distDir, 'about', 'index.html'), 'utf-8');
  archivedDadHtml = readFileSync(
    resolve(distDir, 'archive', gift.slug, 'index.html'),
    'utf-8',
  );
  archiveHtml = readFileSync(resolve(distDir, 'archive', 'index.html'), 'utf-8');
});

describe('HTML structure - index.html', () => {
  it('has lang="en" on <html>', () => {
    expect(indexHtml).toMatch(/<html[^>]*lang="en"/);
  });

  it('has correct <title>', () => {
    expect(indexHtml).toContain(`<title>${htmlEscape(siteData.name)}</title>`);
  });

  it('has meta viewport tag', () => {
    expect(indexHtml).toMatch(/<meta[^>]*name="viewport"/);
  });

  it('has meta description tag', () => {
    expect(indexHtml).toMatch(/<meta[^>]*name="description"/);
  });

  it('has Open Graph meta tags', () => {
    expect(indexHtml).toMatch(/<meta[^>]*property="og:title"/);
    expect(indexHtml).toMatch(/<meta[^>]*property="og:description"/);
    expect(indexHtml).toMatch(/<meta[^>]*property="og:url"/);
    expect(indexHtml).toMatch(/<meta[^>]*property="og:type"/);
  });

  it('has canonical URL link', () => {
    expect(indexHtml).toMatch(/<link[^>]*rel="canonical"/);
  });

  it('advertises the RSS feed', () => {
    for (const html of [indexHtml, projectsHtml, postsHtml, aboutHtml, archivedDadHtml, archiveHtml]) {
      expect(html).toMatch(
        /<link[^>]*rel="alternate"[^>]*type="application\/rss\+xml"[^>]*href="https:\/\/www\.mattserwinowski\.com\/rss\.xml"/,
      );
    }
  });

  it('has a non-empty <body>', () => {
    const bodyMatch = indexHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/);
    // The match is the "act" step; the two expects form the "assert" step:
    // first prove a body exists, then prove Astro put real page content inside it.
    expect(bodyMatch).not.toBeNull();
    expect(bodyMatch![1].trim().length).toBeGreaterThan(0);
  });

  it('has an <h1> with expected text', () => {
    expect(indexHtml).toMatch(/<h1[^>]*>Recent<\/h1>/);
  });

  it('renders recent projects from the collection', () => {
    expect(indexHtml).toContain(htmlEscape(firstProject.data.title));
    expect(indexHtml).toContain(`href="/projects/${firstProject.id}/"`);
    expect(indexHtml).toMatch(/href="\/projects\/"/);
  });

  it('eagerly loads the first (above-the-fold) card thumbnail', () => {
    // The first recent card is the likely LCP image, so it loads eagerly with
    // high priority; the remaining cards stay lazy.
    const firstImg = indexHtml.match(/<img[^>]*-card-[^>]*>/)?.[0] ?? '';
    expect(firstImg).toMatch(/loading="eager"/);
    expect(firstImg).toMatch(/fetchpriority="high"/);
  });
});

describe('Navigation', () => {
  it('index has nav with links to all pages', () => {
    // Navigation is a site-wide contract, so this uses public hrefs rather than
    // component internals like the Header `navLinks` array.
    expect(indexHtml).toMatch(/href="\/"/);
    expect(indexHtml).toMatch(/href="\/projects\/"/);
    // Posts nav link is hidden until content exists
    expect(indexHtml).toMatch(/href="\/about\/"/);
  });

  it('all pages have navigation', () => {
    for (const html of [projectsHtml, postsHtml, aboutHtml, archivedDadHtml, archiveHtml]) {
      // A loop keeps the invariant readable: every subpage gets the same chrome.
      expect(html).toMatch(/<nav/);
      expect(html).toMatch(/<header/);
    }
  });

  it('has a site-wide RSS icon that links to the footer subscription section', () => {
    for (const html of [indexHtml, projectsHtml, postsHtml, aboutHtml, archivedDadHtml, archiveHtml]) {
      expect(html).toMatch(
        /<a[^>]*href="#subscribe"[^>]*aria-label="Subscribe via RSS"/,
      );
    }
  });
});

describe('HTML structure - subpages', () => {
  it('projects page has correct title', () => {
    expect(projectsHtml).toContain(`<title>Projects - ${htmlEscape(siteData.name)}</title>`);
  });

  it('posts page has correct title', () => {
    expect(postsHtml).toContain(`<title>Posts - ${htmlEscape(siteData.name)}</title>`);
  });

  it('about page has correct title', () => {
    expect(aboutHtml).toContain(`<title>About - ${htmlEscape(siteData.name)}</title>`);
  });

  it('home and projects use the same content-page alignment as project details', () => {
    for (const html of [indexHtml, projectsHtml]) {
      expect(html).toContain('--container: calc(var(--width-prose) + ((var(--width-wide) - var(--width-prose)) / 4.236) + 14rem)');
      expect(html).toContain('--chrome-container: calc(var(--width-prose) + ((var(--width-wide) - var(--width-prose)) / 4.236) + 14rem)');
    }
  });

  it('about uses the wide reading layout (widget in the left gutter) with content-rail chrome', () => {
    // A bespoke container widens the symmetric gutters to 18rem so the
    // now-playing widget has room (see about.astro `containerWidth`)...
    expect(aboutHtml).toContain('--container: calc(var(--width-prose) + (2 * (18rem + 2rem)))');
    // ...while chrome="project-detail" keeps the header/nav on the content rail.
    expect(aboutHtml).toContain('--chrome-container: calc(var(--width-prose) + ((var(--width-wide) - var(--width-prose)) / 4.236) + 14rem)');
  });

  it('all pages have footer', () => {
    for (const html of [indexHtml, projectsHtml, postsHtml, aboutHtml, archivedDadHtml, archiveHtml]) {
      expect(html).toMatch(/<footer/);
    }
  });

  it('all pages have a non-collecting RSS subscription form', () => {
    for (const html of [indexHtml, projectsHtml, postsHtml, aboutHtml, archivedDadHtml, archiveHtml]) {
      expect(html).toMatch(/<section[^>]*id="subscribe"/);
      expect(html).toMatch(/<form[^>]*action="\/rss\.xml"[^>]*method="get"/);
      const emailInput = html.match(/<input[^>]*id="subscribe-email"[^>]*>/)?.[0] ?? '';
      expect(emailInput).toMatch(/type="email"/);
      expect(emailInput).toMatch(/\srequired(?:\s|>|=)/);
      expect(emailInput).not.toMatch(/\sname=/);
      expect(html).toContain('Your address is not collected or sent anywhere.');
      expect(html).toMatch(/<button[^>]*type="submit"[^>]*>[\s\S]*?Subscribe[\s\S]*?<\/button>/);
    }
  });

  it('all pages have a back-to-top widget', () => {
    for (const html of [indexHtml, projectsHtml, postsHtml, aboutHtml, archivedDadHtml, archiveHtml]) {
      expect(html).toMatch(/id="back-to-top"/);
      expect(html).toMatch(/aria-label="Back to top"/);
    }
  });

  it('content pages have a reading-progress bar, except the About page', () => {
    for (const html of [indexHtml, projectsHtml, postsHtml]) {
      expect(html).toMatch(/id="reading-progress"/);
    }
    // The About page opts out of the reading-progress bar (Base `readingProgress={false}`).
    expect(aboutHtml).not.toMatch(/id="reading-progress"/);
  });
});

describe('Archive', () => {
  it('is public by direct URL but excluded from search indexing', () => {
    expect(archiveHtml).toContain(`<title>Archive - ${htmlEscape(siteData.name)}</title>`);
    expect(archiveHtml).toMatch(/<h1[^>]*>Archive<\/h1>/);
    expect(archiveHtml).toMatch(
      /<meta[^>]*name="robots"[^>]*content="noindex, follow"/,
    );
  });

  it('stays out of the primary navigation', () => {
    const header = archiveHtml.match(/<header[^>]*>[\s\S]*?<\/header>/)?.[0] ?? '';
    expect(header).not.toMatch(/href="\/archive\/"/);
    expect(indexHtml).not.toMatch(/href="\/archive\/"/);
  });

  it('lists the standalone archive page', () => {
    expect(archiveHtml).toContain(`href="/archive/${gift.slug}/"`);
    expect(archiveHtml).toContain(htmlEscape(gift.title));
  });
});

describe('Archived gift page', () => {
  it('has the expected title and birthday heading', () => {
    expect(archivedDadHtml).toContain(`<title>${htmlEscape(giftNote.data.title)}</title>`);
    expect(archivedDadHtml).toContain(`>${htmlEscape(gift.heading)}</h1>`);
    expect(archivedDadHtml).toMatch(
      /<meta[^>]*name="robots"[^>]*content="noindex, follow"/,
    );
  });

  it('renders the birthday GIF with intrinsic dimensions', () => {
    const gif = archivedDadHtml.match(/<img[^>]*data-birthday-media[^>]*>/)?.[0] ?? '';
    expect(gif).toContain(`src="${htmlEscape(gift.media.src)}"`);
    expect(gif).toContain(`alt="${htmlEscape(gift.media.alt)}"`);
    expect(gif).toContain(`width="${gift.media.width}"`);
    expect(gif).toContain(`height="${gift.media.height}"`);
    expect(archivedDadHtml).toContain(`data-gif-src="${htmlEscape(gift.media.src)}"`);
  });

  it('renders an accessible animated gift control', () => {
    expect(archivedDadHtml).toMatch(/data-gift-box[^>]*data-state="closed"/);
    expect(archivedDadHtml).toMatch(
      /<button[^>]*aria-label="Open your gift"[^>]*aria-expanded="false"[^>]*aria-controls="gift-box-reveal"/,
    );
    expect(archivedDadHtml).toMatch(
      /id="gift-box-reveal"[^>]*aria-hidden="true"/,
    );
    expect(archivedDadHtml).toMatch(/role="status"[^>]*aria-live="polite"/);
  });

  it('does not render a gift hyperlink', () => {
    expect(archivedDadHtml).not.toMatch(/<a[^>]*data-gift-box-link/);
    expect(archivedDadHtml).not.toContain('replace-with-final-gift-link');
  });

  it('renders both driving vouchers inside the gift reveal', () => {
    const revealStart = archivedDadHtml.indexOf('data-gift-box-reveal');
    const ferrariPosition = archivedDadHtml.indexOf(gift.images[0].src);
    const porschePosition = archivedDadHtml.indexOf(gift.images[1].src);
    expect(revealStart).toBeGreaterThan(-1);
    expect(ferrariPosition).toBeGreaterThan(revealStart);
    expect(porschePosition).toBeGreaterThan(revealStart);
    expect(archivedDadHtml).toMatch(/class="gift-car gift-car--left"/);
    expect(archivedDadHtml).toMatch(/class="gift-car gift-car--right"/);
  });

  it('keeps the birthday message inside the hidden gift reveal', () => {
    const messagePosition = archivedDadHtml.indexOf(htmlEscape(giftNote.body.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/)[0]));
    const revealStart = archivedDadHtml.indexOf('data-gift-box-reveal');
    const revealEnd = archivedDadHtml.indexOf('</div>', messagePosition);
    expect(revealStart).toBeGreaterThan(-1);
    expect(messagePosition).toBeGreaterThan(-1);
    expect(messagePosition).toBeGreaterThan(revealStart);
    expect(revealEnd).toBeGreaterThan(messagePosition);
  });

  it('stays unlisted from the main navigation', () => {
    const header = archivedDadHtml.match(/<header[^>]*>[\s\S]*?<\/header>/)?.[0] ?? '';
    expect(header).not.toContain(`href="/archive/${gift.slug}/"`);
    expect(indexHtml).not.toContain(`href="/archive/${gift.slug}/"`);
  });

  it('disables reading progress for the short standalone page', () => {
    expect(archivedDadHtml).not.toMatch(/id="reading-progress"/);
  });
});

describe('Now-playing widget - About page only', () => {
  it('About page renders the "What I\'m listening to" widget', () => {
    expect(aboutHtml).toMatch(/data-now-playing/);
    expect(aboutHtml).toContain("What I'm listening to");
  });

  it('widget bakes in the Worker endpoint from config', () => {
    // The endpoint is resolved at build time and passed via data-endpoint so the
    // client script never depends on client-side env inlining.
    expect(aboutHtml).toMatch(/data-endpoint="https?:\/\/[^"]+"/);
  });

  it('widget starts hidden so nothing flashes before data loads', () => {
    const match = aboutHtml.match(/<section[^>]*data-now-playing[^>]*>/);
    expect(match).not.toBeNull();
    expect(match?.[0]).toMatch(/\shidden(\s|>|=)/);
  });

  it('widget does NOT appear on other pages', () => {
    for (const html of [indexHtml, projectsHtml, postsHtml]) {
      expect(html).not.toMatch(/data-now-playing/);
      expect(html).not.toContain("What I'm listening to");
    }
  });
});

describe('Liked Songs widget - About page only', () => {
  it('About page renders the "Liked Songs" widget', () => {
    expect(aboutHtml).toMatch(/data-liked-songs/);
    expect(aboutHtml).toContain('Liked Songs');
  });

  it('widget bakes in the Worker liked-songs endpoint from config', () => {
    const match = aboutHtml.match(/<section[^>]*data-liked-songs[^>]*>/);
    expect(match).not.toBeNull();
    expect(match?.[0]).toMatch(/data-endpoint="https?:\/\/[^"]+\/liked-songs"/);
  });

  it('widget starts hidden so nothing flashes before data loads', () => {
    const match = aboutHtml.match(/<section[^>]*data-liked-songs[^>]*>/);
    expect(match).not.toBeNull();
    expect(match?.[0]).toMatch(/\shidden(\s|>|=)/);
  });

  it('renders five skeleton rows for the client to fill', () => {
    const rows = aboutHtml.match(/data-row(\s|>|=)/g) ?? [];
    // Two instances (desktop gutter + mobile), five rows each.
    expect(rows.length).toBe(10);
  });

  it('widget does NOT appear on other pages', () => {
    for (const html of [indexHtml, projectsHtml, postsHtml]) {
      expect(html).not.toMatch(/data-liked-songs/);
    }
  });
});

describe('Social links - index.html', () => {
  it('has a social links nav', () => {
    expect(indexHtml).toMatch(/aria-label="Social links"/);
  });

  it('links to GitHub profile', () => {
    expect(indexHtml).toMatch(/href="https:\/\/github\.com\/meserwinowski"/);
  });

  it('links to LinkedIn profile', () => {
    expect(indexHtml).toMatch(/href="https:\/\/www\.linkedin\.com\/in\/matthewserwinowski\/"/);
  });
});

describe('Theme toggle', () => {
  it('has a theme toggle button', () => {
    expect(indexHtml).toMatch(/id="theme-toggle"/);
  });

  it('defaults to dark theme', () => {
    expect(indexHtml).toMatch(/data-theme="dark"/);
  });

  it('has theme init script to prevent flash', () => {
    expect(indexHtml).toMatch(/localStorage\.getItem\(['"]theme['"]\)/);
  });
});

describe('Projects page - content collection', () => {
  it('renders project cards with links to detail pages', () => {
    expect(projectsHtml).toContain(`href="/projects/${firstProject.id}/"`);
  });

  it('displays project titles', () => {
    expect(projectsHtml).toContain(htmlEscape(firstProject.data.title));
  });

  it('displays status badges', () => {
    // Assert a published-status badge renders, not a specific label — the status
    // is vault-driven and flips between ongoing/completed over a project's life.
    expect(projectsHtml).toMatch(/class="[^"]*status-badge[^"]*"\s+data-status="(completed|ongoing)"/);
  });

  it('displays tags', () => {
    for (const tag of firstProject.data.tags) expect(projectsHtml).toContain(htmlEscape(tag));
  });

  it('renders the project thumbnail as a responsive, lazy-loaded card image', () => {
    // Cards use build-time WebP derivatives (generate-card-thumbnails.mjs) instead
    // of the full-size synced asset: a 400w/800w srcset, intrinsic 16:9 dimensions,
    // and lazy loading below the fold on the projects index.
    const img = projectsHtml.match(/<img[^>]*-card-[^>]*>/)?.[0] ?? '';
    const thumbnail = cardManifest[firstProject.data.thumbnail];
    expect(img).toContain(`src="${thumbnail.src}"`);
    expect(img).toContain(`srcset="${thumbnail.srcset}"`);
    expect(img).toMatch(/sizes="[^"]+"/);
    expect(img).toMatch(/width="800"/);
    expect(img).toMatch(/height="450"/);
    expect(img).toMatch(/loading="lazy"/);
    expect(img).toMatch(/decoding="async"/);
    // A tiny inline LQIP blur-up is painted behind the image while it loads.
    expect(img).toMatch(/background-image:url\(data:image\/webp;base64,/);
  });
});

describe('Project detail pages', () => {
  let projectDetailHtml: string;

  beforeAll(() => {
    // Project detail pages are generated from the content collection, so this
    // fixture proves the dynamic `[slug]` route made it into `dist/`.
    projectDetailHtml = readFileSync(resolve(distDir, 'projects', firstProject.id, 'index.html'), 'utf-8');
  });

  it('has correct title', () => {
    expect(projectDetailHtml).toContain(`<title>${htmlEscape(firstProject.data.title)} - ${htmlEscape(siteData.name)}</title>`);
  });

  it('has back link to projects index', () => {
    expect(projectDetailHtml).toMatch(/href="\/projects\/"/);
  });

  it('renders markdown content', () => {
    expect(projectDetailHtml).toMatch(/class="prose"[\s\S]*<p>/);
  });

  it('shows estimated reading time near the top of the detail page', () => {
    expect(projectDetailHtml).toMatch(/Estimated reading time: \d+ minutes?/);
    expect(projectDetailHtml).toMatch(/data-reading-time/);
  });

  it('renders a table of contents with links to markdown sections', () => {
    expect(projectDetailHtml).toMatch(/aria-label="Table of contents"/);
    const headings = projectHeadings.filter(heading => heading.depth <= 3);
    expect(headings.length).toBeGreaterThan(1);
    for (const { slug: id } of headings) {
      expect(projectDetailHtml).toContain(`href="#${id}"`);
      expect(projectDetailHtml).toContain(`data-toc-target="${id}"`);
    }
  });

  it('renders a project meta rail that balances the table-of-contents gutter', () => {
    expect(projectDetailHtml).toMatch(/>Details</);
    expect(projectDetailHtml).toMatch(/>Status</);
    expect(projectDetailHtml).toMatch(/>Published</);
  });
});

describe('Markdown rendering', () => {
  let stageMixerHtml: string;

  beforeAll(() => {
    // Re-read locally for this group so the markdown-rendering contract is easy
    // to follow without scrolling back to the project-detail suite.
    stageMixerHtml = readFileSync(resolve(distDir, 'projects', firstProject.id, 'index.html'), 'utf-8');
  });

  it('renders markdown headings with permalink icon links', () => {
    const headings = projectHeadings.filter(heading => heading.depth <= 2);
    expect(headings.length).toBeGreaterThan(1);
    for (const { slug: id } of headings) {
      const body = stageMixerHtml.match(new RegExp(`<h[1-2] id="${id}"[^>]*>(.*?)</h[1-2]>`))?.[1] ?? '';
      expect(body).toContain(`href="#${id}"`);
      expect(body).toContain('data-heading-permalink="true"');
    }
  });

  it('includes h1-h3 headings in the table of contents without noisy deeper headings', () => {
    for (const { slug: id } of projectHeadings.filter(heading => heading.depth > 3)) {
      expect(stageMixerHtml).not.toContain(`data-toc-target="${id}"`);
    }
  });
});
