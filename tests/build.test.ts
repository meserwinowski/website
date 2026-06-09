import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const distDir = resolve(import.meta.dirname, '..', 'dist');

describe('Build verification', () => {
  it('astro build completes successfully', () => {
    execSync('npm run build', {
      cwd: resolve(import.meta.dirname, '..'),
      stdio: 'pipe',
    });
  });

  it('dist/index.html exists after build', () => {
    expect(existsSync(resolve(distDir, 'index.html'))).toBe(true);
  });
});
