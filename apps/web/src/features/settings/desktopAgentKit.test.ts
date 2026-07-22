import { describe, expect, it, vi } from 'vitest';
import { getDesktopAgentKitBridge } from './desktopAgentKit';

describe('getDesktopAgentKitBridge', () => {
  it('returns null outside desktop', () => {
    expect(getDesktopAgentKitBridge({})).toBeNull();
  });

  it('invokes each channel and unwraps a successful envelope', async () => {
    const responses: Record<string, unknown> = {
      'agentKit.getStatus': { ok: true, data: { enabled: true } },
      'agentKit.setEnabled': { ok: true, data: { enabled: false } },
      'agentKit.forceSync': { ok: true, data: { conflicts: [], updates: [] } },
      'agentKit.resolveConflict': { ok: true, data: { dest: 'CLAUDE.md' } },
      'agentKit.applyUpdate': { ok: true, data: { dest: 'CLAUDE.md' } },
      'agentKit.clean': { ok: true, data: { cleaned: true } },
    };
    const invoke = vi.fn(async (channel: string) => {
      if (!(channel in responses)) throw new Error(`unexpected channel ${channel}`);
      return responses[channel];
    });
    const bridge = getDesktopAgentKitBridge({ desktop: { rpc: { invoke } } });
    expect(bridge).not.toBeNull();

    expect(await bridge?.getStatus()).toEqual({ enabled: true });
    expect(invoke).toHaveBeenCalledWith('agentKit.getStatus');

    expect(await bridge?.setEnabled({ enabled: false })).toEqual({ enabled: false });
    expect(invoke).toHaveBeenCalledWith('agentKit.setEnabled', { enabled: false });

    expect(await bridge?.forceSync()).toEqual({ conflicts: [], updates: [] });
    expect(invoke).toHaveBeenCalledWith('agentKit.forceSync');

    expect(
      await bridge?.resolveConflict({ dest: 'CLAUDE.md', choice: 'use-template' }),
    ).toEqual({ dest: 'CLAUDE.md' });
    expect(invoke).toHaveBeenCalledWith('agentKit.resolveConflict', {
      dest: 'CLAUDE.md',
      choice: 'use-template',
    });

    expect(await bridge?.applyUpdate({ dest: 'CLAUDE.md' })).toEqual({ dest: 'CLAUDE.md' });
    expect(invoke).toHaveBeenCalledWith('agentKit.applyUpdate', { dest: 'CLAUDE.md' });

    expect(await bridge?.clean()).toEqual({ cleaned: true });
    expect(invoke).toHaveBeenCalledWith('agentKit.clean');
  });

  it('throws when the envelope reports failure', async () => {
    const invoke = vi.fn(async () => ({ ok: false, error: 'boom' }));
    const bridge = getDesktopAgentKitBridge({ desktop: { rpc: { invoke } } });

    await expect(bridge?.getStatus()).rejects.toThrow('boom');
  });
});
