import { describe, expect, it, vi } from 'vitest';
import { getDesktopContextMenuBridge } from './electronBridge.js';

describe('getDesktopContextMenuBridge', () => {
  it('returns null when desktop rpc is missing', () => {
    expect(getDesktopContextMenuBridge({})).toBeNull();
  });

  it('invokes contextMenu.popup over shell rpc', async () => {
    const invoke = vi.fn(async () => ({ selectedKey: null }));
    const bridge = getDesktopContextMenuBridge({ desktop: { rpc: { invoke } } });
    expect(bridge).not.toBeNull();

    const request = { items: [], x: 1, y: 2 };
    await bridge?.popup(request);
    expect(invoke).toHaveBeenCalledWith('contextMenu.popup', request);
  });
});
