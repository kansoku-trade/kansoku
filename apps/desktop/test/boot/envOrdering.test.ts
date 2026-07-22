import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('bundled boot ordering', () => {
  const distDir = join(import.meta.dirname, '..', '..', 'dist-main');
  const bundlePath = join(distDir, 'main.mjs');

  it.skipIf(!existsSync(bundlePath))(
    "sets TRADE_PROJECT_ROOT before packages/core/src/env.ts's top-level APP_ROOT const evaluates",
    () => {
      const content = readFileSync(bundlePath, 'utf8');
      const chunkNames = readdirSync(distDir).filter(
        (name) => name.endsWith('.mjs') && name !== 'main.mjs',
      );
      const chunkContent = new Map(
        chunkNames.map((name) => [name, readFileSync(join(distDir, name), 'utf8')]),
      );

      const bootEnvPattern = /process\.env\.TRADE_PROJECT_ROOT\s*=\s*dataRoot/;
      const appRootDecl = /(?:const|var) APP_ROOT =/;

      const findChunk = (pat: RegExp): string | null => {
        if (pat.test(content)) return 'main.mjs';
        const hit = chunkNames.find((name) => pat.test(chunkContent.get(name)!));
        return hit ?? null;
      };

      const bootChunk = findChunk(bootEnvPattern);
      expect(bootChunk, 'boot env assignment not found in any dist-main chunk').not.toBeNull();

      const envChunk = findChunk(appRootDecl);
      if (envChunk === null) return;

      if (bootChunk === 'main.mjs' && envChunk === 'main.mjs') {
        const bootIdx = content.search(bootEnvPattern);
        const envIdx = content.search(appRootDecl);
        expect(bootIdx).toBeLessThan(envIdx);
        return;
      }

      const staticImports = (source: string) =>
        [...source.matchAll(/(?:from|import)\s+"\.\/([^"]+)"/g)].map((m) => m[1]);
      const reachable = new Set<string>();
      const queue = staticImports(content);
      while (queue.length > 0) {
        const name = queue.pop()!;
        if (reachable.has(name)) continue;
        reachable.add(name);
        const source = chunkContent.get(name);
        if (source) queue.push(...staticImports(source));
      }
      expect(reachable.has(envChunk)).toBe(false);
    },
  );
});
