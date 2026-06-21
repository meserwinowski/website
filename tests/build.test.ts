/**
 * Build Verification Tests
 *
 * Ensures that `astro build` completes without errors and produces
 * the expected output files in dist/. This is the most basic safety
 * net — if imports are broken, config is invalid, or syntax errors
 * exist, this test will catch it.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(projectDir, 'dist');

describe('Build verification', () => {
  it('astro build completes successfully', () => {
    execSync('npm run build', {
      cwd: projectDir,
      stdio: 'pipe',
    });
  });

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

  it('dist/projects/personal-website/index.html exists after build', () => {
    expect(existsSync(resolve(distDir, 'projects', 'personal-website', 'index.html'))).toBe(true);
  });

  it('dist/projects/home-lab/index.html exists after build', () => {
    expect(existsSync(resolve(distDir, 'projects', 'home-lab', 'index.html'))).toBe(true);
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
    expect(robots).toContain('Sitemap: https://www.mattserwinowski.com/sitemap-index.xml');
    expect(robots).toContain('User-agent: GPTBot');
    expect(robots).toContain('Disallow: /');
  });

  it('security.txt publishes contact metadata at the canonical well-known URL', () => {
    const securityTxt = readFileSync(resolve(distDir, '.well-known', 'security.txt'), 'utf-8');
    expect(securityTxt).toContain('Contact: https://github.com/meserwinowski');
    expect(securityTxt).toContain('Expires: 2027-06-21T21:19:45Z');
    expect(securityTxt).toContain(
      'Canonical: https://www.mattserwinowski.com/.well-known/security.txt',
    );
  });
});
