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

      const envChunk = readdirSync(distDir).find((name) => {
        if (!name.startsWith('env-') || !name.endsWith('.mjs')) return false;
        return readFileSync(join(distDir, name), 'utf8').includes('const APP_ROOT =');
      });
      expect(envChunk).toBeDefined();
      expect(content.includes(`from "./${envChunk}"`)).toBe(false);
      const dynamicImportIndex = content.indexOf(`import("./${envChunk}")`);
      expect(dynamicImportIndex).toBeGreaterThanOrEqual(0);
      expect(bootEnvIndex).toBeLessThan(dynamicImportIndex);
    },
  );
});
