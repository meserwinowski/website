import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { assembleContent, exportContent } from '../scripts/content-pipeline.mjs';

const temporary = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fixture(mode = 'production') {
  const root = mkdtempSync(join(tmpdir(), 'site-content-test-'));
  temporary.push(root);
  const source = join(root, 'input');
  cpSync(resolve('tests/fixtures/site'), source, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8'));
  manifest.mode = mode;
  writeFileSync(join(source, 'manifest.json'), JSON.stringify(manifest));
  return { source, root: join(root, 'site'), manifest };
}

describe('production content assembly', () => {
  it('publishes only eligible content and assets and removes stale outputs', () => {
    const options = fixture();
    mkdirSync(join(options.root, 'public/assets'), { recursive: true });
    writeFileSync(join(options.root, 'public/assets/stale.svg'), 'old');
    assembleContent(options);
    expect(existsSync(join(options.root, 'src/content/projects/example-project.md'))).toBe(true);
    expect(existsSync(join(options.root, 'src/content/projects/archived-project.md'))).toBe(true);
    expect(existsSync(join(options.root, 'src/content/pages/archive/example-gift.md'))).toBe(true);
    expect(existsSync(join(options.root, 'src/content/projects/private-draft.md'))).toBe(false);
    expect(existsSync(join(options.root, 'public/assets/draft-only.svg'))).toBe(false);
    expect(existsSync(join(options.root, 'public/assets/stale.svg'))).toBe(false);
    expect(existsSync(join(options.root, 'public/assets/.embed-manifest.json'))).toBe(false);
  });

  it('keeps shared images when a published page also references them', () => {
    const options = fixture();
    options.manifest.documents[0].assets.push('draft-only.svg');
    writeFileSync(join(options.source, 'manifest.json'), JSON.stringify(options.manifest));
    assembleContent(options);
    expect(existsSync(join(options.root, 'public/assets/draft-only.svg'))).toBe(true);
  });

  it('refuses demo fallback for production without replacing existing inputs', () => {
    const options = fixture('demo');
    mkdirSync(join(options.root, 'src/content'), { recursive: true });
    writeFileSync(join(options.root, 'src/content/keeper.md'), 'existing');
    expect(() => assembleContent(options)).toThrow(/demo fallback/);
    expect(readFileSync(join(options.root, 'src/content/keeper.md'), 'utf8')).toBe('existing');
  });

  it.each(['../outside.svg', '/absolute.svg', 'missing.png', 'raw.heic', 'source.md'])(
    'rejects unsafe or missing image %s before replacing output',
    (asset) => {
      const options = fixture();
      options.manifest.documents[0].assets = [asset];
      if (asset === 'source.md')
        writeFileSync(join(options.source, 'assets/source.md'), 'Private source note');
      writeFileSync(join(options.source, 'manifest.json'), JSON.stringify(options.manifest));
      expect(() => assembleContent(options)).toThrow();
      expect(existsSync(join(options.root, 'src/content'))).toBe(false);
    }
  );

  it('fails if an explicitly published page is absent', () => {
    const options = fixture();
    options.manifest.documents = options.manifest.documents.filter(
      (document) => document.path !== 'pages/about.md'
    );
    writeFileSync(join(options.source, 'manifest.json'), JSON.stringify(options.manifest));
    expect(() => assembleContent(options)).toThrow(/Missing published page/);
  });

  it.skipIf(process.platform === 'win32')('refuses assets linked outside the snapshot', () => {
    const options = fixture();
    const outside = join(dirname(options.source), 'outside.png');
    writeFileSync(outside, 'private outside data');
    const image = join(options.source, 'assets/example-project/hero.png');
    rmSync(image);
    symlinkSync(outside, image);
    expect(() => assembleContent(options)).toThrow(/symlinks/);
    expect(existsSync(join(options.root, 'public/assets'))).toBe(false);
  });
});

describe('vault publishing export', () => {
  function vaultFixture() {
    const options = fixture();
    const vault = join(dirname(options.source), 'vault');
    mkdirSync(vault);
    cpSync(join(options.source, 'content'), vault, { recursive: true });
    cpSync(join(options.source, 'assets'), join(vault, 'assets'), { recursive: true });
    cpSync(join(options.source, 'site.json'), join(vault, 'site.json'));
    const destination = join(dirname(options.source), 'private');
    mkdirSync(join(destination, '.github'), { recursive: true });
    writeFileSync(join(destination, '.github/keeper'), 'keep');
    return { vaultDir: vault, destination };
  }

  it('normalizes lists without changing fenced code or deleting checkout metadata', async () => {
    const options = vaultFixture();
    const note = join(options.vaultDir, 'projects/example-project.md');
    writeFileSync(
      note,
      `${readFileSync(note, 'utf8')}\n\t- nested\n\`\`\`text\n\tliteral\n\`\`\`\n`
    );
    await exportContent(options);
    const exported = readFileSync(
      join(options.destination, 'content/projects/example-project.md'),
      'utf8'
    );
    expect(exported).toContain('\n  - nested');
    expect(exported).toContain('\n\tliteral');
    expect(existsSync(join(options.destination, '.github/keeper'))).toBe(true);
    expect(existsSync(join(options.destination, 'content/projects/private-draft.md'))).toBe(true);
  });

  it('does not replace a prior export when required source content is missing', async () => {
    const options = vaultFixture();
    writeFileSync(join(options.destination, 'site.json'), 'previous');
    rmSync(join(options.vaultDir, 'pages'), { recursive: true });
    await expect(exportContent(options)).rejects.toThrow();
    expect(readFileSync(join(options.destination, 'site.json'), 'utf8')).toBe('previous');
  });

  it('validates unpublished notes against the same schema as Astro', async () => {
    const options = vaultFixture();
    const note = join(options.vaultDir, 'projects/private-draft.md');
    writeFileSync(note, readFileSync(note, 'utf8').replace('tags: [example]', 'tags: [123]'));
    writeFileSync(join(options.destination, 'site.json'), 'previous');
    await expect(exportContent(options)).rejects.toThrow(/tags/);
    expect(readFileSync(join(options.destination, 'site.json'), 'utf8')).toBe('previous');
  });

  it('reuses newer converted assets without restoring raw source bytes', async () => {
    const options = vaultFixture();
    await exportContent(options);
    const asset = join(options.destination, 'assets/private-draft/draft-only.svg');
    const cached = '<svg xmlns="http://www.w3.org/2000/svg"><text>Converted cache</text></svg>';
    writeFileSync(asset, cached);
    const old = new Date('2000-01-01');
    utimesSync(join(options.vaultDir, 'assets/draft-only.svg'), old, old);
    await exportContent(options);
    expect(readFileSync(asset, 'utf8')).toBe(cached);
  });
});
