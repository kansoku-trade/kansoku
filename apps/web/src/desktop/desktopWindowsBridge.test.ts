import { describe, expect, it, vi } from 'vitest';
import { getPopoutBridge, getWindowsBridge } from './desktopWindowsBridge';

describe('getWindowsBridge', () => {
  it('returns null when desktop rpc is absent', () => {
    expect(getWindowsBridge({})).toBeNull();
  });

  it('invokes shell rpc channels', async () => {
    const invoke = vi.fn(async () => undefined);
    const bridge = getWindowsBridge({ desktop: { rpc: { invoke } } });
    expect(bridge).not.toBeNull();

    await bridge?.getContext();
    expect(invoke).toHaveBeenCalledWith('windows.getContext');

    bridge?.reportActiveTab('tab-1');
    expect(invoke).toHaveBeenCalledWith('windows.reportActiveTab', 'tab-1');
  });
});

describe('getPopoutBridge', () => {
  it('returns null when desktop rpc is absent', () => {
    expect(getPopoutBridge({})).toBeNull();
  });

  it('invokes windows.openPopout', async () => {
    const invoke = vi.fn(async () => undefined);
    const bridge = getPopoutBridge({ desktop: { rpc: { invoke } } });
    await bridge?.openPopout('NVDA.US');
    expect(invoke).toHaveBeenCalledWith('windows.openPopout', 'NVDA.US');
  });
});
