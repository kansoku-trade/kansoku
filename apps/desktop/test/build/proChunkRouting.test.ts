import { describe, expect, it } from 'vitest';
import { chunkFileNamesFor } from '../../vite.main.config.js';

describe('chunkFileNamesFor (desktop)', () => {
  it('routes a chunk containing a pro module into __pro__', () => {
    const name = chunkFileNamesFor({
      name: 'edition',
      moduleIds: ['/repo/apps/pro/overlays/apps/desktop/src/edition/pro.pro.ts'],
      facadeModuleId: null,
    });
    expect(name).toBe('__pro__/[name]-[hash].mjs');
  });

  it('routes a public chunk to the normal location', () => {
    const name = chunkFileNamesFor({
      name: 'kernel',
      moduleIds: ['/repo/apps/desktop/src/boot/kernel.ts'],
      facadeModuleId: null,
    });
    expect(name).toBe('[name]-[hash].mjs');
  });

  it('routes a module-less pro facade chunk into __pro__', () => {
    const name = chunkFileNamesFor({
      name: 'facade',
      moduleIds: [],
      facadeModuleId: '/repo/apps/pro/overlays/apps/desktop/src/edition/pro.pro.ts',
    });
    expect(name).toBe('__pro__/[name]-[hash].mjs');
  });
});
