import { describe, expect, it, vi } from 'vitest';
import { getDesktopWorkspaceBridge } from './desktopWorkspace';

describe('getDesktopWorkspaceBridge', () => {
  it('reads and opens the fixed Agent Workspace through shell RPC', async () => {
    const invoke = vi.fn(async () => ({ path: '/tmp/Workspace', mode: 'local' as const }));
    const bridge = getDesktopWorkspaceBridge({ desktop: { rpc: { invoke } } });

    expect(await bridge?.get()).toEqual({ path: '/tmp/Workspace', mode: 'local' });
    expect(invoke).toHaveBeenCalledWith('workspace.get');
    await bridge?.open();
    expect(invoke).toHaveBeenCalledWith('workspace.open');
    await bridge?.restoreLocal();
    expect(invoke).toHaveBeenCalledWith('workspace.restoreLocal');
  });

  it('is absent outside the desktop host', () => {
    expect(getDesktopWorkspaceBridge({})).toBeNull();
  });
});
