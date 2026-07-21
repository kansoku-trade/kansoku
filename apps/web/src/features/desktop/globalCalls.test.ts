import { describe, expect, it, vi } from 'vitest';
import { createGlobalCallManager, type RendererCallsBridge } from './globalCalls';

function fakeBridge(): RendererCallsBridge & {
  dispatch(method: string, args?: unknown): Promise<unknown>;
} {
  let cb: ((method: string, args: unknown) => Promise<unknown>) | null = null;
  return {
    handle: vi.fn((next) => {
      cb = next;
      return () => {
        cb = null;
      };
    }),
    dispatch(method, args) {
      if (!cb) throw new Error('bridge not wired');
      return cb(method, args);
    },
  };
}

describe('createGlobalCallManager', () => {
  it('dispatches a call to the registered handler', async () => {
    const bridge = fakeBridge();
    const manager = createGlobalCallManager(bridge);
    manager.register('tabs.getActiveTabId', () => 'tab-1');

    await expect(bridge.dispatch('tabs.getActiveTabId')).resolves.toBe('tab-1');
  });

  it('passes args through and awaits async handlers', async () => {
    const bridge = fakeBridge();
    const manager = createGlobalCallManager(bridge);
    manager.register('echo', async (args) => args);

    await expect(bridge.dispatch('echo', { id: 'x' })).resolves.toEqual({ id: 'x' });
  });

  it('rejects for an unregistered method', async () => {
    const bridge = fakeBridge();
    const manager = createGlobalCallManager(bridge);
    manager.register('known', () => 1);

    await expect(bridge.dispatch('unknown')).rejects.toThrow('no handler for unknown');
  });

  it('wires the bridge once across multiple registrations', () => {
    const bridge = fakeBridge();
    const manager = createGlobalCallManager(bridge);
    manager.register('a', () => 1);
    manager.register('b', () => 2);

    expect(bridge.handle).toHaveBeenCalledTimes(1);
  });

  it('unregister removes the handler unless it was replaced', async () => {
    const bridge = fakeBridge();
    const manager = createGlobalCallManager(bridge);
    const unregister = manager.register('m', () => 'old');
    manager.register('m', () => 'new');
    unregister();

    await expect(bridge.dispatch('m')).resolves.toBe('new');
  });

  it('does nothing without a bridge', () => {
    const manager = createGlobalCallManager(null);
    expect(() => manager.register('m', () => 1)).not.toThrow();
  });
});
