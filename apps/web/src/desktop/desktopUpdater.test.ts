import { describe, expect, it } from 'vitest';
import { getDesktopUpdaterBridge, isAvailableStatus } from './desktopUpdater';

describe('isAvailableStatus', () => {
  it('is true only for available', () => {
    expect(isAvailableStatus({ kind: 'available', version: '1', htmlUrl: 'https://x' })).toBe(true);
    expect(isAvailableStatus({ kind: 'unknown' })).toBe(false);
    expect(isAvailableStatus(null)).toBe(false);
  });
});

describe('getDesktopUpdaterBridge', () => {
  it('returns null when desktop.updater is absent', () => {
    expect(getDesktopUpdaterBridge({})).toBeNull();
  });

  it('returns the updater bridge when present', () => {
    const updater = {
      getStatus: async () => ({ kind: 'unknown' as const }),
      onStatus: () => () => {},
      installNow: async () => {},
    };
    expect(getDesktopUpdaterBridge({ desktop: { updater } })).toBe(updater);
  });
});
