/**
 * HTML Structure Tests
 *
 * Reads the built HTML files from dist/ and verifies that key
 * structural elements are present and correct. Catches regressions
 * like missing meta tags, wrong page titles, or removed headings —
 * especially useful as a guardrail for automated/agentic changes.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const distDir = resolve(import.meta.dirname, '..', 'dist');
let indexHtml: string;
let projectsHtml: string;
let postsHtml: string;
let aboutHtml: string;

beforeAll(() => {
  indexHtml = readFileSync(resolve(distDir, 'index.html'), 'utf-8');
  projectsHtml = readFileSync(resolve(distDir, 'projects', 'index.html'), 'utf-8');
  postsHtml = readFileSync(resolve(distDir, 'posts', 'index.html'), 'utf-8');
  aboutHtml = readFileSync(resolve(distDir, 'about', 'index.html'), 'utf-8');
});

describe('HTML structure - index.html', () => {
  it('has lang="en" on <html>', () => {
    expect(indexHtml).toMatch(/<html[^>]*lang="en"/);
  });

  it('has correct <title>', () => {
    expect(indexHtml).toMatch(/<title>Matt Serwinowski<\/title>/);
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

  it('has a non-empty <body>', () => {
    const bodyMatch = indexHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/);
    expect(bodyMatch).not.toBeNull();
    expect(bodyMatch![1].trim().length).toBeGreaterThan(0);
  });

  it('has an <h1> with expected text', () => {
    expect(indexHtml).toMatch(/<h1[^>]*>Matt Serwinowski<\/h1>/);
  });

  it('renders home page content from collection', () => {
    expect(indexHtml).toContain('Software engineer');
  });
});

describe('Navigation', () => {
  it('index has nav with links to all pages', () => {
    expect(indexHtml).toMatch(/href="\/"/);
    expect(indexHtml).toMatch(/href="\/projects"/);
    // Posts nav link is hidden until content exists
    expect(indexHtml).toMatch(/href="\/about"/);
  });

  it('all pages have navigation', () => {
    for (const html of [projectsHtml, postsHtml, aboutHtml]) {
      expect(html).toMatch(/<nav/);
      expect(html).toMatch(/<header/);
    }
  });
});

describe('HTML structure - subpages', () => {
  it('projects page has correct title', () => {
    expect(projectsHtml).toMatch(/<title>Projects - Matt Serwinowski<\/title>/);
  });

  it('posts page has correct title', () => {
    expect(postsHtml).toMatch(/<title>Posts - Matt Serwinowski<\/title>/);
  });

  it('about page has correct title', () => {
    expect(aboutHtml).toMatch(/<title>About - Matt Serwinowski<\/title>/);
  });

  it('all pages have footer', () => {
    for (const html of [indexHtml, projectsHtml, postsHtml, aboutHtml]) {
      expect(html).toMatch(/<footer/);
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
    expect(projectsHtml).toMatch(/href="\/projects\/personal-website\/"/);
    expect(projectsHtml).toMatch(/href="\/projects\/home-lab\/"/);
  });

  it('displays project titles', () => {
    expect(projectsHtml).toContain('Personal Website');
    expect(projectsHtml).toContain('Home Lab Server');
  });

  it('displays status badges', () => {
    expect(projectsHtml).toContain('Ongoing');
  });

  it('displays tags', () => {
    expect(projectsHtml).toContain('software');
    expect(projectsHtml).toContain('hardware');
  });

  it('shows thumbnails', () => {
    expect(projectsHtml).toMatch(/src="\/images\/projects\/personal-website\.svg"/);
  });
});

describe('Project detail pages', () => {
  let projectDetailHtml: string;

  beforeAll(() => {
    projectDetailHtml = readFileSync(resolve(distDir, 'projects', 'personal-website', 'index.html'), 'utf-8');
  });

  it('has correct title', () => {
    expect(projectDetailHtml).toMatch(/<title>Personal Website - Matt Serwinowski<\/title>/);
  });

  it('has back link to projects index', () => {
    expect(projectDetailHtml).toMatch(/href="\/projects\/"/);
  });

  it('renders markdown content', () => {
    expect(projectDetailHtml).toContain('Astro 6');
    expect(projectDetailHtml).toContain('Tailwind CSS v4');
  });

  it('has repo link when provided', () => {
    expect(projectDetailHtml).toMatch(/href="https:\/\/github\.com\/meserwinowski\/website"/);
  });
});
