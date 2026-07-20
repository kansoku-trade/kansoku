import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isProModule, proLeakGuard } from '../src/chunkGuard.js';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function runGuard(bundle: Record<string, unknown>): string | null {
  const plugin = proLeakGuard({ proDir: '__pro__/' });
  let error: string | null = null;
  const ctx = {
    error(message: string) {
      error = message;
      throw new Error(message);
    },
  };
  try {
    (plugin.generateBundle as (this: typeof ctx, o: unknown, b: unknown) => void).call(ctx, {}, bundle);
  } catch {
    // guard reported via ctx.error; message captured above
  }
  return error;
}

describe('isProModule', () => {
  it('matches a path inside apps/pro', () => {
    expect(isProModule('/repo/apps/pro/overlays/apps/web/src/x.pro.tsx')).toBe(true);
  });

  it('does not match a public path that merely mentions pro', () => {
    expect(isProModule('/repo/apps/web/src/proHelpers.ts')).toBe(false);
  });

  it('strips vite query suffixes before deciding', () => {
    expect(isProModule('/repo/apps/pro/overlays/x.pro.ts?used')).toBe(true);
  });

  it('follows a symlink projection back into apps/pro', () => {
    const root = mkdtempSync(join(tmpdir(), 'kansoku-guard-'));
    roots.push(root);
    mkdirSync(join(root, 'apps', 'pro', 'overlays'), { recursive: true });
    mkdirSync(join(root, 'apps', 'web', 'src'), { recursive: true });
    const real = join(root, 'apps', 'pro', 'overlays', 'page.pro.tsx');
    const link = join(root, 'apps', 'web', 'src', 'page.pro.tsx');
    writeFileSync(real, 'export default null;\n');
    symlinkSync(real, link);
    expect(isProModule(link)).toBe(true);
  });
});

describe('proLeakGuard', () => {
  it('passes when pro modules stay inside the encrypted dir', () => {
    expect(
      runGuard({
        'main.mjs': { type: 'chunk', modules: { '/repo/apps/desktop/src/main.ts': {} }, imports: [] },
        '__pro__/pro-a1.mjs': {
          type: 'chunk',
          modules: { '/repo/apps/pro/overlays/edition.pro.ts': {} },
          imports: [],
        },
      }),
    ).toBeNull();
  });

  it('recognises the encrypted dir under a nested asset prefix', () => {
    expect(
      runGuard({
        'assets/index-a1.js': {
          type: 'chunk',
          modules: { '/repo/apps/web/src/main.tsx': {} },
          imports: [],
        },
        'assets/__pro__/pro-a1.js': {
          type: 'chunk',
          modules: { '/repo/apps/pro/overlays/apps/web/src/edition/pro.pro.ts': {} },
          imports: [],
        },
      }),
    ).toBeNull();
  });

  it('fails when a pro module lands in a public chunk', () => {
    expect(
      runGuard({
        'main.mjs': {
          type: 'chunk',
          modules: { '/repo/apps/pro/overlays/leaked.pro.ts': {} },
          imports: [],
        },
      }),
    ).toContain('pro module outside');
  });

  it('fails when a public chunk statically imports an encrypted chunk', () => {
    expect(
      runGuard({
        'main.mjs': {
          type: 'chunk',
          modules: { '/repo/apps/desktop/src/main.ts': {} },
          imports: ['__pro__/pro-a1.mjs'],
        },
        '__pro__/pro-a1.mjs': { type: 'chunk', modules: {}, imports: [] },
      }),
    ).toContain('statically imports encrypted chunk');
  });

  it('allows a public chunk to reach the encrypted dir dynamically', () => {
    expect(
      runGuard({
        'main.mjs': {
          type: 'chunk',
          modules: { '/repo/apps/desktop/src/edition/pro.ts': {} },
          imports: [],
          dynamicImports: ['__pro__/pro-a1.mjs'],
        },
        '__pro__/pro-a1.mjs': { type: 'chunk', modules: {}, imports: [] },
      }),
    ).toBeNull();
  });
});
