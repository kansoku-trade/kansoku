import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { overlayCandidateForFile, proOverlayPlugin, resolveProOverlayId } from '../src/index.js';

const { join } = path;

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function makeRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function overlayFixture() {
  const root = makeRoot('kansoku-overlay-');
  const publicDir = join(root, 'public');
  const privateDir = join(root, 'private');
  mkdirSync(publicDir);
  mkdirSync(privateDir);
  const importer = join(publicDir, 'entry.ts');
  const target = join(privateDir, 'edition.pro.ts');
  const projection = join(publicDir, 'edition.pro.ts');
  writeFileSync(importer, '');
  writeFileSync(target, 'export const edition = "pro";');
  symlinkSync(target, projection);
  return { importer, projection };
}

describe('resolveProOverlayId', () => {
  it('prefers the colocated projection for an explicit .js import', () => {
    const fixture = overlayFixture();
    expect(resolveProOverlayId('./edition.js', fixture.importer)).toBe(fixture.projection);
  });

  it('preserves a Vite query on the projected path', () => {
    const fixture = overlayFixture();
    expect(resolveProOverlayId('./edition.js?raw', fixture.importer)).toBe(
      `${fixture.projection}?raw`,
    );
  });

  it('leaves OSS, package, and already-pro imports alone', () => {
    const fixture = overlayFixture();
    expect(resolveProOverlayId('./edition.js', fixture.importer, { enabled: false })).toBeNull();
    expect(resolveProOverlayId('@kansoku/core', fixture.importer)).toBeNull();
    expect(resolveProOverlayId('./edition.pro.js', fixture.importer)).toBeNull();
  });

  it('does not treat an untracked regular .pro file as a managed projection', () => {
    const root = makeRoot('kansoku-overlay-');
    const importer = join(root, 'entry.ts');
    writeFileSync(importer, '');
    writeFileSync(join(root, 'edition.pro.ts'), 'export const edition = "local";');
    expect(resolveProOverlayId('./edition.js', importer)).toBeNull();
  });

  it('resolves an extensionless import to the sibling .pro.ts projection', () => {
    const fixture = overlayFixture();
    expect(resolveProOverlayId('./edition', fixture.importer)).toBe(fixture.projection);
  });

  it('resolves an extensionless import to the index.pro projection when only the index overlay exists', () => {
    const root = makeRoot('kansoku-overlay-');
    const publicDir = join(root, 'public');
    const privateDir = join(root, 'private');
    mkdirSync(join(publicDir, 'widgets'), { recursive: true });
    mkdirSync(join(privateDir, 'widgets'), { recursive: true });
    const importer = join(publicDir, 'entry.ts');
    writeFileSync(importer, '');
    const target = join(privateDir, 'widgets', 'index.pro.ts');
    const projection = join(publicDir, 'widgets', 'index.pro.ts');
    writeFileSync(target, 'export const widgets = "pro";');
    symlinkSync(target, projection);

    expect(resolveProOverlayId('./widgets', importer)).toBe(projection);
  });

  it('throws naming the importer when a .pro overlay imports its own logical default', () => {
    const fixture = overlayFixture();

    let thrown: unknown;
    try {
      resolveProOverlayId('./edition.js', fixture.projection);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain(fixture.projection);
    expect(message).toContain('own logical default');
  });

  describe('overlayRoot validation', () => {
    it('accepts a projection whose realpath sits inside overlayRoot', () => {
      const root = makeRoot('kansoku-overlay-root-');
      const overlayRoot = join(root, 'overlay-root');
      const publicDir = join(root, 'public');
      mkdirSync(overlayRoot, { recursive: true });
      mkdirSync(publicDir, { recursive: true });
      const importer = join(publicDir, 'entry.ts');
      writeFileSync(importer, '');
      const target = join(overlayRoot, 'edition.pro.ts');
      writeFileSync(target, 'export const edition = "pro";');
      const projection = join(publicDir, 'edition.pro.ts');
      symlinkSync(target, projection);

      expect(resolveProOverlayId('./edition.js', importer, { overlayRoot })).toBe(projection);
    });

    it('throws naming the projection and its real target when the symlink escapes overlayRoot', () => {
      const root = makeRoot('kansoku-overlay-root-');
      const overlayRoot = join(root, 'overlay-root');
      const publicDir = join(root, 'public');
      const outsideDir = join(root, 'outside');
      mkdirSync(overlayRoot, { recursive: true });
      mkdirSync(publicDir, { recursive: true });
      mkdirSync(outsideDir, { recursive: true });
      const importer = join(publicDir, 'entry.ts');
      writeFileSync(importer, '');
      const outsideTarget = join(outsideDir, 'edition.pro.ts');
      writeFileSync(outsideTarget, 'export const edition = "rogue";');
      const projection = join(publicDir, 'edition.pro.ts');
      symlinkSync(outsideTarget, projection);

      const expectedRealTarget = realpathSync(outsideTarget);
      let thrown: unknown;
      try {
        resolveProOverlayId('./edition.js', importer, { overlayRoot });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).toContain(projection);
      expect(message).toContain(expectedRealTarget);
    });

    it('throws a friendly error naming a nonexistent overlayRoot instead of a raw ENOENT', () => {
      const root = makeRoot('kansoku-overlay-root-missing-');
      const publicDir = join(root, 'public');
      const targetDir = join(root, 'target');
      mkdirSync(publicDir, { recursive: true });
      mkdirSync(targetDir, { recursive: true });
      const importer = join(publicDir, 'entry.ts');
      writeFileSync(importer, '');
      const target = join(targetDir, 'edition.pro.ts');
      writeFileSync(target, 'export const edition = "pro";');
      const projection = join(publicDir, 'edition.pro.ts');
      symlinkSync(target, projection);
      const missingOverlayRoot = join(root, 'does-not-exist');

      let thrown: unknown;
      try {
        resolveProOverlayId('./edition.js', importer, { overlayRoot: missingOverlayRoot });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).toContain(missingOverlayRoot);
      expect(message).not.toContain('ENOENT');
    });
  });
});

describe('overlayCandidateForFile', () => {
  it('maps a resolved file to its .pro sibling and returns it when it is a symlink', () => {
    const root = makeRoot('kansoku-overlay-file-');
    const filePath = join(root, 'settings.tsx');
    writeFileSync(filePath, '');
    const target = join(root, 'settings-real.pro.tsx');
    writeFileSync(target, '');
    const projection = join(root, 'settings.pro.tsx');
    symlinkSync(target, projection);

    expect(overlayCandidateForFile(filePath)).toBe(projection);
  });

  it('returns null when no symlink projection exists next to the resolved file', () => {
    const root = makeRoot('kansoku-overlay-file-');
    const filePath = join(root, 'settings.tsx');
    writeFileSync(filePath, '');

    expect(overlayCandidateForFile(filePath)).toBeNull();
  });
});

describe('proOverlayPlugin host-first resolution', () => {
  function hostFixture() {
    const root = makeRoot('kansoku-overlay-host-');
    const importer = join(root, 'entry.ts');
    writeFileSync(importer, '');
    const resolvedFile = join(root, 'node', 'settings.ts');
    mkdirSync(path.dirname(resolvedFile), { recursive: true });
    writeFileSync(resolvedFile, '');
    const target = join(root, 'node', 'settings-real.pro.ts');
    writeFileSync(target, '');
    const projection = join(root, 'node', 'settings.pro.ts');
    symlinkSync(target, projection);
    return { importer, projection, resolvedFile, root };
  }

  it('resolves an overlay for a bare specifier once the host resolver produces the default target', async () => {
    const fixture = hostFixture();
    const plugin = proOverlayPlugin();
    const context = { resolve: async () => ({ id: fixture.resolvedFile }) };
    const result = await plugin.resolveId.call(context, '@scope/settings', fixture.importer);
    expect(result).toBe(fixture.projection);
  });

  it('invokes the host resolver bound to the plugin context, not detached', async () => {
    const fixture = hostFixture();
    const plugin = proOverlayPlugin();
    const context = {
      token: 'plugin-context',
      resolve() {
        if (this.token !== 'plugin-context') {
          throw new TypeError("Cannot read properties of undefined (reading 'token')");
        }
        return Promise.resolve({ id: fixture.resolvedFile });
      },
    };
    const result = await plugin.resolveId.call(context, '@scope/settings', fixture.importer);
    expect(result).toBe(fixture.projection);
  });

  it('preserves a query on the host-resolved id', async () => {
    const fixture = hostFixture();
    const plugin = proOverlayPlugin();
    const context = { resolve: async () => ({ id: `${fixture.resolvedFile}?raw` }) };
    const result = await plugin.resolveId.call(context, '@scope/settings', fixture.importer);
    expect(result).toBe(`${fixture.projection}?raw`);
  });

  it('ignores a host resolution that lives under node_modules', async () => {
    const fixture = hostFixture();
    const plugin = proOverlayPlugin();
    const nodeModulesFile = join(fixture.root, 'node_modules', 'pkg', 'index.js');
    mkdirSync(path.dirname(nodeModulesFile), { recursive: true });
    writeFileSync(nodeModulesFile, '');
    const context = { resolve: async () => ({ id: nodeModulesFile }) };
    const result = await plugin.resolveId.call(context, 'pkg', fixture.importer);
    expect(result).toBeNull();
  });

  it('ignores an external host resolution', async () => {
    const fixture = hostFixture();
    const plugin = proOverlayPlugin();
    const context = { resolve: async () => ({ id: 'pkg', external: true }) };
    const result = await plugin.resolveId.call(context, 'pkg', fixture.importer);
    expect(result).toBeNull();
  });

  it('returns null without calling the host resolver for an external URL-like source', async () => {
    const fixture = hostFixture();
    const plugin = proOverlayPlugin();
    let called = false;
    const context = {
      resolve: async () => {
        called = true;
        return null;
      },
    };
    const result = await plugin.resolveId.call(context, 'node:fs', fixture.importer);
    expect(result).toBeNull();
    expect(called).toBe(false);
  });

  it('returns null for a bare specifier when the host resolver is unavailable', async () => {
    const fixture = hostFixture();
    const plugin = proOverlayPlugin();
    const resolveId = plugin.resolveId as (
      source: string,
      importer?: string,
    ) => Promise<string | null>;
    const result = await resolveId.call(plugin, '@scope/settings', fixture.importer);
    expect(result).toBeNull();
  });

  it('returns null without calling the host resolver for an absolute-path source with no importer', async () => {
    const fixture = hostFixture();
    const plugin = proOverlayPlugin();
    let called = false;
    const context = {
      resolve: async () => {
        called = true;
        return { id: fixture.resolvedFile };
      },
    };
    const result = await plugin.resolveId.call(context, fixture.resolvedFile, undefined);
    expect(result).toBeNull();
    expect(called).toBe(false);
  });

  it('resolves the overlay projection for an absolute-path source with an importer (alias rewritten to absolute)', async () => {
    const fixture = hostFixture();
    const plugin = proOverlayPlugin();
    const aliasSource = join(fixture.root, 'alias-target.ts');
    const context = { resolve: async () => ({ id: fixture.resolvedFile }) };
    const result = await plugin.resolveId.call(context, aliasSource, fixture.importer);
    expect(result).toBe(fixture.projection);
  });

  it('propagates the overlayRoot violation as a rejection when the host-resolved candidate symlink escapes overlayRoot', async () => {
    const root = makeRoot('kansoku-overlay-host-root-');
    const overlayRoot = join(root, 'overlay-root');
    mkdirSync(overlayRoot, { recursive: true });
    const importer = join(root, 'entry.ts');
    writeFileSync(importer, '');
    const resolvedFile = join(root, 'node', 'settings.ts');
    mkdirSync(path.dirname(resolvedFile), { recursive: true });
    writeFileSync(resolvedFile, '');
    const outsideDir = join(root, 'outside');
    mkdirSync(outsideDir, { recursive: true });
    const outsideTarget = join(outsideDir, 'settings.pro.ts');
    writeFileSync(outsideTarget, '');
    const projection = join(root, 'node', 'settings.pro.ts');
    symlinkSync(outsideTarget, projection);

    const plugin = proOverlayPlugin({ overlayRoot });
    const context = { resolve: async () => ({ id: resolvedFile }) };
    await expect(plugin.resolveId.call(context, '@scope/settings', importer)).rejects.toThrow(
      'resolves outside overlayRoot',
    );
  });

  it('rejects a self-import cycle when the host resolver produces the overlay importer as its own logical default', async () => {
    const root = makeRoot('kansoku-overlay-host-cycle-');
    const resolvedFile = join(root, 'settings.ts');
    writeFileSync(resolvedFile, '');
    const target = join(root, 'settings-real.pro.ts');
    writeFileSync(target, '');
    const importer = join(root, 'settings.pro.ts');
    symlinkSync(target, importer);

    const plugin = proOverlayPlugin();
    const context = { resolve: async () => ({ id: resolvedFile }) };
    await expect(plugin.resolveId.call(context, '@scope/settings', importer)).rejects.toThrow(
      'own logical default',
    );
  });
});
