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
      const bootEnvIndex = content.indexOf('process.env.TRADE_PROJECT_ROOT = dataRoot');
      expect(bootEnvIndex).toBeGreaterThanOrEqual(0);

      const envConstInMain = content.indexOf('const APP_ROOT =');
      if (envConstInMain >= 0) {
        expect(bootEnvIndex).toBeLessThan(envConstInMain);
        return;
      }

      const chunkNames = readdirSync(distDir).filter(
        (name) => name.endsWith('.mjs') && name !== 'main.mjs',
      );
      const chunkContent = new Map(
        chunkNames.map((name) => [name, readFileSync(join(distDir, name), 'utf8')]),
      );
      const envChunk = chunkNames.find((name) => chunkContent.get(name)!.includes('const APP_ROOT ='));
      expect(envChunk).toBeDefined();
      expect(content.includes(`from "./${envChunk}"`)).toBe(false);

      // The env chunk may be dynamically imported directly, or via an
      // intermediate barrel chunk that statically re-exports it — bundler
      // chunking is free to add that indirection, so accept either shape.
      const importedChunk = content.includes(`import("./${envChunk}")`)
        ? envChunk!
        : chunkNames.find((name) => chunkContent.get(name)!.includes(`from "./${envChunk}"`));
      expect(importedChunk).toBeDefined();
      const dynamicImportIndex = content.indexOf(`import("./${importedChunk}")`);
      expect(dynamicImportIndex).toBeGreaterThanOrEqual(0);
      expect(bootEnvIndex).toBeLessThan(dynamicImportIndex);
    },
  );
});
