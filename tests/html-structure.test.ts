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
let html: string;

beforeAll(() => {
  html = readFileSync(resolve(distDir, 'index.html'), 'utf-8');
});

describe('HTML structure - index.html', () => {
  it('has lang="en" on <html>', () => {
    expect(html).toMatch(/<html[^>]*lang="en"/);
  });

  it('has correct <title>', () => {
    expect(html).toMatch(/<title>Matt Serwinowski<\/title>/);
  });

  it('has meta viewport tag', () => {
    expect(html).toMatch(/<meta[^>]*name="viewport"/);
  });

  it('has meta description tag', () => {
    expect(html).toMatch(/<meta[^>]*name="description"/);
  });

  it('has a non-empty <body>', () => {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
    expect(bodyMatch).not.toBeNull();
    expect(bodyMatch![1].trim().length).toBeGreaterThan(0);
  });

  it('has an <h1> with expected text', () => {
    expect(html).toMatch(/<h1[^>]*>Matt Serwinowski<\/h1>/);
  });
});
