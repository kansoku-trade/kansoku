import { afterEach, describe, expect, it } from 'vitest';
import { loadPro } from '@kansoku/core/pro/loader';
import { unregisterProModuleForTests } from '@kansoku/core/pro/registry';
import { tsukiRequest } from './helpers.js';

describe('pro-absent HTTP surface', () => {
  afterEach(async () => {
    await loadPro();
  });

  it('returns 404 for the symbols deep-dive route when pro is absent', async () => {
    unregisterProModuleForTests();
    const res = await tsukiRequest('/api/symbols/MU/deep-dive/status');
    expect(res.status).toBe(404);
  });

  it('serves the license status route when pro is absent (license lives in core, not ProModule)', async () => {
    unregisterProModuleForTests();
    const res = await tsukiRequest('/api/license/status');
    expect(res.status).toBe(200);
  });

  it('reports pro:false via /capabilities when pro is absent', async () => {
    unregisterProModuleForTests();
    const res = await tsukiRequest('/api/capabilities');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      pro: false,
      licensed: false,
      license: { state: 'unlicensed' },
      features: { 'symbol-follow': 'absent', 'deep-dive': 'absent', 'research-ai': 'absent' },
      hasEncBundle: false,
    });
  });
});
