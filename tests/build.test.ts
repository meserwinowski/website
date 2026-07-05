/**
 * build.test.ts — Build-output smoke tests.
 *
 * This file protects the deployable artifact, not just the source tree. `npm test`
 * runs `astro build` first, so these Vitest checks can safely assert against
 * `dist/` — the same static files nginx will serve. That catches broken imports,
 * invalid Astro config, missing generated routes, and public metadata files before
 * deploy.
 *
 * Vitest reads like a small spec: `describe` groups related behavior, each `it`
 * names one promise the site should keep, and `expect` records the observable
 * outcome. Most checks here are smoke tests: intentionally broad, cheap
 * assertions that a page/file exists at its public URL.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// All path expectations are rooted in the built site, because Astro's source
// files can look correct while the generated static output is missing a route.
const distDir = resolve(projectDir, 'dist');

describe('Build verification', () => {
  // `astro build` is a real, multi-second build shelled out via execSync, so give
  // it a generous timeout instead of Vitest's 5s default (which it sits right on).
  it('astro build completes successfully', () => {
    execSync('npm run build', {
      cwd: projectDir,
      stdio: 'pipe',
    });
  }, 60000);

  it('dist/index.html exists after build', () => {
    expect(existsSync(resolve(distDir, 'index.html'))).toBe(true);
  });

  it('dist/projects/index.html exists after build', () => {
    expect(existsSync(resolve(distDir, 'projects', 'index.html'))).toBe(true);
  });

  it('dist/posts/index.html exists after build', () => {
    expect(existsSync(resolve(distDir, 'posts', 'index.html'))).toBe(true);
  });

  it('dist/about/index.html exists after build', () => {
    expect(existsSync(resolve(distDir, 'about', 'index.html'))).toBe(true);
  });

  it('dist/projects/stage-mixer/index.html exists after build', () => {
    expect(existsSync(resolve(distDir, 'projects', 'stage-mixer', 'index.html'))).toBe(true);
  });

  it('does not build detail pages for planning-status projects', () => {
    // Content with `status: planning` can appear in lists, but must not publish
    // a standalone detail page until it is ready for readers.
    expect(existsSync(resolve(distDir, 'projects', 'personal-website', 'index.html'))).toBe(false);
    expect(existsSync(resolve(distDir, 'projects', 'home-lab', 'index.html'))).toBe(false);
  });

  it('dist/404.html exists after build', () => {
    expect(existsSync(resolve(distDir, '404.html'))).toBe(true);
  });

  it('sitemap-index.xml exists after build', () => {
    expect(existsSync(resolve(distDir, 'sitemap-index.xml'))).toBe(true);
  });

  it('robots.txt exists after build', () => {
    expect(existsSync(resolve(distDir, 'robots.txt'))).toBe(true);
  });

  it('.well-known/security.txt exists after build', () => {
    expect(existsSync(resolve(distDir, '.well-known', 'security.txt'))).toBe(true);
  });

  it('robots.txt references the sitemap and disallows AI crawlers', () => {
    const robots = readFileSync(resolve(distDir, 'robots.txt'), 'utf-8');
    // These are integration checks over the generated file: they verify the
    // site policy that search/crawler tooling actually receives.
    expect(robots).toContain('Sitemap: https://www.mattserwinowski.com/sitemap-index.xml');
    expect(robots).toContain('User-agent: GPTBot');
    expect(robots).toContain('Disallow: /');
  });

  it('security.txt publishes contact metadata at the canonical well-known URL', () => {
    const securityTxt = readFileSync(resolve(distDir, '.well-known', 'security.txt'), 'utf-8');
    // security.txt has to live at the well-known path with stable contact and
    // canonical metadata so scanners and humans can find the right disclosure route.
    expect(securityTxt).toContain('Contact: https://github.com/meserwinowski');
    expect(securityTxt).toContain('Expires: 2027-06-21T21:19:45Z');
    expect(securityTxt).toContain(
      'Canonical: https://www.mattserwinowski.com/.well-known/security.txt',
    );
  });
});
