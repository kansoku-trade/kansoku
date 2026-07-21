import { describe, expect, it, vi } from 'vitest';
import { getDesktopUpdaterBridge, isAvailableStatus } from './desktopUpdater';

describe('isAvailableStatus', () => {
  it('is true only for available', () => {
    expect(isAvailableStatus({ kind: 'available', version: '1', htmlUrl: 'https://x' })).toBe(true);
    expect(isAvailableStatus({ kind: 'unknown' })).toBe(false);
    expect(isAvailableStatus(null)).toBe(false);
  });
});

describe('getDesktopUpdaterBridge', () => {
  it('returns null when desktop rpc or updater push is absent', () => {
    expect(getDesktopUpdaterBridge({})).toBeNull();
    expect(getDesktopUpdaterBridge({ desktop: { rpc: { invoke: vi.fn() } } })).toBeNull();
    expect(getDesktopUpdaterBridge({ desktop: { updater: { onStatus: vi.fn() } } })).toBeNull();
  });

  it('invokes shell rpc and forwards status subscription', async () => {
    const invoke = vi.fn(async () => ({ kind: 'unknown' as const }));
    const unsubscribe = vi.fn();
    const onStatus = vi.fn(() => unsubscribe);
    const bridge = getDesktopUpdaterBridge({
      desktop: { rpc: { invoke }, updater: { onStatus } },
    });
    expect(bridge).not.toBeNull();

    await bridge?.getStatus();
    expect(invoke).toHaveBeenCalledWith('updater.getStatus');

    await bridge?.installNow();
    expect(invoke).toHaveBeenCalledWith('updater.installNow');

    const cb = vi.fn();
    expect(bridge?.onStatus(cb)).toBe(unsubscribe);
    expect(onStatus).toHaveBeenCalledWith(cb);
  });
});
