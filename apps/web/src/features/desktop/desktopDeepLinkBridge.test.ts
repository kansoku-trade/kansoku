import { describe, expect, it, vi } from 'vitest';
import { getDesktopDeepLinkBridge } from './desktopDeepLinkBridge';

describe('getDesktopDeepLinkBridge', () => {
  it('returns null when desktop.deepLink is absent', () => {
    expect(getDesktopDeepLinkBridge({})).toBeNull();
  });

  it('subscribes through desktop.deepLink.onNavigate', () => {
    const onNavigate = vi.fn(() => () => {});
    const bridge = getDesktopDeepLinkBridge({ desktop: { deepLink: { onNavigate } } });
    expect(bridge).not.toBeNull();

    const cb = vi.fn();
    bridge?.onNavigate(cb);
    expect(onNavigate).toHaveBeenCalledWith(cb);
  });
});
