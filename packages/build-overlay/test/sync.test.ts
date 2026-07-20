import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runOverlaySync } from '../scripts/overlaySync.mjs';

const { dirname, join, relative, resolve } = path;

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function makeRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

interface Fixture {
  root: string;
  publicRoot: string;
  overlayRoot: string;
  manifestPath: string;
  statePath: string;
}

function makeFixture(): Fixture {
  const root = makeRoot('kansoku-sync-');
  const publicRoot = join(root, 'public');
  const overlayRoot = join(publicRoot, 'apps', 'pro', 'overlays');
  mkdirSync(overlayRoot, { recursive: true });
  return {
    root,
    publicRoot,
    overlayRoot,
    manifestPath: join(publicRoot, 'apps', 'pro', 'overlay.private-only.json'),
    statePath: join(publicRoot, '.kansoku-overlay-links.json'),
  };
}

function writeOverlayFile(fixture: Fixture, relPath: string, content = ''): string {
  const filePath = join(fixture.overlayRoot, relPath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
  return filePath;
}

function destinationFor(fixture: Fixture, relPath: string): string {
  return join(fixture.publicRoot, relPath);
}

function linkExists(target: string): boolean {
  try {
    lstatSync(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function writeOssBase(fixture: Fixture, proRelPath: string, content = ''): void {
  const baseRelPath = proRelPath.replace(/\.pro(\.(?:[cm]?ts|tsx))$/, '$1');
  const basePath = destinationFor(fixture, baseRelPath);
  mkdirSync(dirname(basePath), { recursive: true });
  writeFileSync(basePath, content);
}

function writeManifest(fixture: Fixture, files: string[]): void {
  mkdirSync(dirname(fixture.manifestPath), { recursive: true });
  writeFileSync(fixture.manifestPath, JSON.stringify({ files }));
}

function run(fixture: Fixture, checkOnly = false) {
  return runOverlaySync({
    publicRoot: fixture.publicRoot,
    overlayRoot: fixture.overlayRoot,
    manifestPath: fixture.manifestPath,
    statePath: fixture.statePath,
    checkOnly,
  });
}

describe('runOverlaySync', () => {
  it('creates projections, writes state, and returns a source -> destination audit summary', () => {
    const fixture = makeFixture();
    const source = writeOverlayFile(fixture, 'foo.pro.ts', 'export const foo = "pro";');
    writeOssBase(fixture, 'foo.pro.ts');

    const result = run(fixture);

    expect(result.errors).toEqual([]);
    const destination = destinationFor(fixture, 'foo.pro.ts');
    expect(lstatSync(destination).isSymbolicLink()).toBe(true);
    expect(resolve(dirname(destination), readlinkSync(destination))).toBe(source);
    expect(result.summary).toEqual([
      `${relative(fixture.publicRoot, source)} -> ${relative(fixture.publicRoot, destination)}`,
    ]);

    expect(existsSync(fixture.statePath)).toBe(true);
    const state = JSON.parse(readFileSync(fixture.statePath, 'utf8'));
    expect(state.links).toEqual([{ destination: 'foo.pro.ts', source: 'foo.pro.ts' }]);
  });

  it('ignores non-.pro.* files inside overlays', () => {
    const fixture = makeFixture();
    writeOverlayFile(fixture, 'notes.md', '# not an overlay');
    writeOverlayFile(fixture, 'helper.ts', 'export const helper = 1;');

    const result = run(fixture);

    expect(result.errors).toEqual([]);
    expect(result.mappings).toEqual([]);
    expect(result.summary).toEqual([]);
    expect(existsSync(destinationFor(fixture, 'notes.md'))).toBe(false);
    expect(existsSync(destinationFor(fixture, 'helper.ts'))).toBe(false);
  });

  describe('checkOnly', () => {
    it('performs zero writes and reports no errors when every projection is already valid', () => {
      const fixture = makeFixture();
      writeOverlayFile(fixture, 'foo.pro.ts', 'export const foo = "pro";');
      writeOssBase(fixture, 'foo.pro.ts');
      run(fixture);
      const stateBefore = readFileSync(fixture.statePath, 'utf8');
      const destination = destinationFor(fixture, 'foo.pro.ts');
      const linkBefore = readlinkSync(destination);

      const result = run(fixture, true);

      expect(result.errors).toEqual([]);
      expect(readFileSync(fixture.statePath, 'utf8')).toBe(stateBefore);
      expect(readlinkSync(destination)).toBe(linkBefore);
    });

    it('errors when a projection is missing', () => {
      const fixture = makeFixture();
      writeOverlayFile(fixture, 'foo.pro.ts', 'export const foo = "pro";');
      writeOssBase(fixture, 'foo.pro.ts');

      const result = run(fixture, true);

      expect(result.errors).toEqual(['missing overlay projection: foo.pro.ts']);
      expect(existsSync(destinationFor(fixture, 'foo.pro.ts'))).toBe(false);
    });
  });

  describe('wrong-source projection (错链)', () => {
    function makeWrongSourceFixture() {
      const fixture = makeFixture();
      const source = writeOverlayFile(fixture, 'foo.pro.ts', 'export const foo = "pro";');
      writeOssBase(fixture, 'foo.pro.ts');
      // "wrong.ts" (no ".pro." infix) so it sits inside overlayRoot without being
      // discovered by walk() as a projection mapping of its own.
      const wrongTarget = join(fixture.overlayRoot, 'wrong.ts');
      writeFileSync(wrongTarget, 'export const foo = "wrong";');
      const destination = destinationFor(fixture, 'foo.pro.ts');
      mkdirSync(dirname(destination), { recursive: true });
      symlinkSync(wrongTarget, destination);
      return { fixture, source, destination };
    }

    it('repairs the projection in sync mode', () => {
      const { fixture, source, destination } = makeWrongSourceFixture();

      const result = run(fixture);

      expect(result.errors).toEqual([]);
      expect(resolve(dirname(destination), readlinkSync(destination))).toBe(source);
    });

    it('errors in check mode without touching the link', () => {
      const { fixture, destination } = makeWrongSourceFixture();

      const result = run(fixture, true);

      expect(result.errors).toEqual([
        'overlay projection points to the wrong source: foo.pro.ts',
      ]);
      expect(lstatSync(destination).isSymbolicLink()).toBe(true);
    });

    it('refuses to repair a wrong-source link whose current target sits outside the overlay root (unmanaged)', () => {
      const fixture = makeFixture();
      writeOverlayFile(fixture, 'foo.pro.ts', 'export const foo = "pro";');
      writeOssBase(fixture, 'foo.pro.ts');
      const foreignTarget = join(fixture.root, 'foreign.pro.ts');
      writeFileSync(foreignTarget, 'export const foo = "foreign";');
      const destination = destinationFor(fixture, 'foo.pro.ts');
      mkdirSync(dirname(destination), { recursive: true });
      symlinkSync(foreignTarget, destination);

      const result = run(fixture);

      expect(result.errors).toEqual([
        'refusing to repair unmanaged projection: foo.pro.ts',
      ]);
      expect(resolve(dirname(destination), readlinkSync(destination))).toBe(foreignTarget);
    });
  });

  describe('stale projection (陈旧链)', () => {
    it('removes the stale link in sync mode', () => {
      const fixture = makeFixture();
      const source = writeOverlayFile(fixture, 'foo.pro.ts', 'export const foo = "pro";');
      writeOssBase(fixture, 'foo.pro.ts');
      run(fixture);
      const destination = destinationFor(fixture, 'foo.pro.ts');
      unlinkSync(source);

      const result = run(fixture);

      expect(result.errors).toEqual([]);
      expect(existsSync(destination)).toBe(false);
      const state = JSON.parse(readFileSync(fixture.statePath, 'utf8'));
      expect(state.links).toEqual([]);
    });

    it('errors in check mode without removing the link', () => {
      const fixture = makeFixture();
      const source = writeOverlayFile(fixture, 'foo.pro.ts', 'export const foo = "pro";');
      writeOssBase(fixture, 'foo.pro.ts');
      run(fixture);
      const destination = destinationFor(fixture, 'foo.pro.ts');
      unlinkSync(source);

      const result = run(fixture, true);

      expect(result.errors).toEqual(['stale overlay projection: foo.pro.ts']);
      expect(linkExists(destination)).toBe(true);
    });

    it('refuses to remove a stale path whose current target sits outside the overlay root (unmanaged)', () => {
      const fixture = makeFixture();
      const source = writeOverlayFile(fixture, 'foo.pro.ts', 'export const foo = "pro";');
      writeOssBase(fixture, 'foo.pro.ts');
      run(fixture);
      const destination = destinationFor(fixture, 'foo.pro.ts');
      unlinkSync(source);
      unlinkSync(destination);
      const rogueTarget = join(fixture.root, 'rogue.txt');
      writeFileSync(rogueTarget, 'not managed');
      symlinkSync(rogueTarget, destination);

      const result = run(fixture);

      expect(result.errors).toEqual(['refusing to remove unmanaged path: foo.pro.ts']);
      expect(resolve(dirname(destination), readlinkSync(destination))).toBe(rogueTarget);
    });
  });

  describe('regular-file collision (普通文件冲突)', () => {
    it('errors in sync mode without touching the file', () => {
      const fixture = makeFixture();
      writeOverlayFile(fixture, 'foo.pro.ts', 'export const foo = "pro";');
      writeOssBase(fixture, 'foo.pro.ts');
      const destination = destinationFor(fixture, 'foo.pro.ts');
      writeFileSync(destination, 'existing regular file');

      const result = run(fixture);

      expect(result.errors).toEqual(['overlay destination is not a symlink: foo.pro.ts']);
      expect(lstatSync(destination).isSymbolicLink()).toBe(false);
      expect(readFileSync(destination, 'utf8')).toBe('existing regular file');
    });

    it('errors in check mode without touching the file', () => {
      const fixture = makeFixture();
      writeOverlayFile(fixture, 'foo.pro.ts', 'export const foo = "pro";');
      writeOssBase(fixture, 'foo.pro.ts');
      const destination = destinationFor(fixture, 'foo.pro.ts');
      writeFileSync(destination, 'existing regular file');

      const result = run(fixture, true);

      expect(result.errors).toEqual(['overlay destination is not a symlink: foo.pro.ts']);
      expect(readFileSync(destination, 'utf8')).toBe('existing regular file');
    });
  });

  describe('out-of-bounds destination (越界路径)', () => {
    it('rejects a destination landing inside apps/pro and skips projecting any mapping in the same run', () => {
      const fixture = makeFixture();
      writeOverlayFile(fixture, 'apps/pro/evil.pro.ts', 'export const evil = "pro";');
      writeOverlayFile(fixture, 'safe.pro.ts', 'export const safe = "pro";');
      writeOssBase(fixture, 'safe.pro.ts');

      const result = run(fixture);

      expect(result.errors).toEqual(['unsafe overlay destination: apps/pro/evil.pro.ts']);
      expect(existsSync(destinationFor(fixture, 'apps/pro/evil.pro.ts'))).toBe(false);
      expect(existsSync(destinationFor(fixture, 'safe.pro.ts'))).toBe(false);
    });

    it('rejects a state entry whose destination escapes publicRoot without touching anything outside the fixture root', () => {
      const fixture = makeFixture();
      const outsidePath = join(fixture.root, 'outside.pro.ts');
      writeFileSync(outsidePath, 'export const outside = "untouched";');
      writeFileSync(
        fixture.statePath,
        `${JSON.stringify(
          { links: [{ destination: '../outside.pro.ts', source: 'outside.pro.ts' }] },
          null,
          2,
        )}\n`,
      );

      const result = run(fixture);

      expect(result.errors).toEqual(['unsafe destination in overlay state: ../outside.pro.ts']);
      expect(readFileSync(outsidePath, 'utf8')).toBe('export const outside = "untouched";');
    });
  });

  describe('private-only manifest', () => {
    it('fails an unregistered pro-only overlay with no OSS base', () => {
      const fixture = makeFixture();
      writeOverlayFile(fixture, 'lonely.pro.ts', 'export const lonely = "pro";');

      const result = run(fixture);

      expect(result.errors).toEqual([
        'overlay has no OSS base and is not registered in apps/pro/overlay.private-only.json: lonely.pro.ts',
      ]);
    });

    it('fails a stale manifest entry that no longer has an overlay file', () => {
      const fixture = makeFixture();
      writeManifest(fixture, ['ghost.pro.ts']);

      const result = run(fixture);

      expect(result.errors).toEqual([
        'private-only manifest apps/pro/overlay.private-only.json has a stale entry: ghost.pro.ts',
      ]);
    });

    it('fails a private-only entry that also has an OSS base', () => {
      const fixture = makeFixture();
      writeOverlayFile(fixture, 'dual.pro.ts', 'export const dual = "pro";');
      writeFileSync(destinationFor(fixture, 'dual.ts'), 'export const dual = "oss";');
      writeManifest(fixture, ['dual.pro.ts']);

      const result = run(fixture);

      expect(result.errors).toEqual([
        'overlay is registered as private-only in apps/pro/overlay.private-only.json but has an OSS base: dual.pro.ts',
      ]);
    });

    it('collects an error for a literal null manifest instead of throwing', () => {
      const fixture = makeFixture();
      writeOverlayFile(fixture, 'lonely.pro.ts', 'export const lonely = "pro";');
      mkdirSync(dirname(fixture.manifestPath), { recursive: true });
      writeFileSync(fixture.manifestPath, 'null');

      const result = run(fixture);

      expect(result.errors).toEqual(
        expect.arrayContaining([
          'private-only manifest apps/pro/overlay.private-only.json must have a "files" array',
        ]),
      );
    });

    it('succeeds when the manifest file is absent and every overlay has an OSS base', () => {
      const fixture = makeFixture();
      writeOverlayFile(fixture, 'foo.pro.ts', 'export const foo = "pro";');
      writeFileSync(destinationFor(fixture, 'foo.ts'), 'export const foo = "oss";');

      const result = run(fixture);

      expect(result.errors).toEqual([]);
    });
  });
});
