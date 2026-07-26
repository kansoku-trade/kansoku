import { describe, expect, it, vi } from 'vitest';
import { getTrainerBridge } from './desktopTrainerBridge';

describe('getTrainerBridge', () => {
  it('returns null when desktop rpc is absent', () => {
    expect(getTrainerBridge({})).toBeNull();
  });

  it('invokes one trainer channel per method', async () => {
    const invoke = vi.fn(async () => ({ ok: true, data: null }));
    const bridge = getTrainerBridge({ desktop: { rpc: { invoke } } });
    expect(bridge).not.toBeNull();

    await bridge?.listPool();
    await bridge?.open({ basePeriod: '5m' });
    await bridge?.resume({ sessionId: 'run-1' });
    await bridge?.step({ sessionId: 'run-1', action: { type: 'hold', bars: 3 } });
    await bridge?.cancel({
      sessionId: 'run-1',
      reason: { category: 'no_setup', summary: '结构没走出来' },
    });
    await bridge?.reveal({ sessionId: 'run-1' });

    expect(invoke.mock.calls).toEqual([
      ['trainer.listPool'],
      ['trainer.open', { basePeriod: '5m' }],
      ['trainer.resume', { sessionId: 'run-1' }],
      ['trainer.step', { sessionId: 'run-1', action: { type: 'hold', bars: 3 } }],
      [
        'trainer.cancel',
        { sessionId: 'run-1', reason: { category: 'no_setup', summary: '结构没走出来' } },
      ],
      ['trainer.reveal', { sessionId: 'run-1' }],
    ]);
  });
});
