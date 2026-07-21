import { describe, expect, it, vi } from 'vitest';
import { getDesktopLogsBridge } from './desktopLogs.js';

describe('getDesktopLogsBridge', () => {
  it('returns null when desktop rpc is missing', () => {
    expect(getDesktopLogsBridge({})).toBeNull();
  });

  it('invokes shell rpc channels', async () => {
    const invoke = vi.fn(async () => ({ path: '/tmp/main.log', dir: '/tmp' }));
    const bridge = getDesktopLogsBridge({ desktop: { rpc: { invoke } } });
    expect(bridge).not.toBeNull();

    await bridge?.getInfo();
    expect(invoke).toHaveBeenCalledWith('logs.getInfo');

    await bridge?.tail({ maxBytes: 128 });
    expect(invoke).toHaveBeenCalledWith('logs.tail', { maxBytes: 128 });

    await bridge?.reveal();
    expect(invoke).toHaveBeenCalledWith('logs.reveal');

    await bridge?.openDir();
    expect(invoke).toHaveBeenCalledWith('logs.openDir');
  });
});
