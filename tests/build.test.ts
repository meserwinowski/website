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
import { existsSync } from 'fs';
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
});
