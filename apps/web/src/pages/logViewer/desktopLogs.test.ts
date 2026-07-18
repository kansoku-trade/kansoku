import { describe, expect, it } from 'vitest';
import { getDesktopLogsBridge } from './desktopLogs.js';

describe('getDesktopLogsBridge', () => {
  it('returns null when desktop bridge is missing', () => {
    expect(getDesktopLogsBridge({})).toBeNull();
  });

  it('returns the logs bridge when present', async () => {
    const logs = {
      getInfo: async () => ({ path: '/tmp/main.log', dir: '/tmp' }),
      tail: async () => ({ path: '/tmp/main.log', text: 'line\n' }),
      reveal: async () => ({ ok: true as const }),
      openDir: async () => ({ ok: true }),
    };
    expect(getDesktopLogsBridge({ desktop: { logs } })).toBe(logs);
  });
});
