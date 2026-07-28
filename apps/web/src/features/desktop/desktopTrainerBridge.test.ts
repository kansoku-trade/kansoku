import { describe, expect, it, vi } from 'vitest';
import type { TrainerReason, TrainerSubmission } from '@kansoku/pro-api';
import { getTrainerBridge } from './desktopTrainerBridge';

const REASON: TrainerReason = { category: 'breakout', summary: '越过 101 的水平阻力后跟进' };

const SUBMISSION: TrainerSubmission = {
  direction: 'long',
  anchor: { timeframe: 'h1', time: '2022-03-02T21:00:00.000Z', price: 100 },
  entry_plan: { entry: 101, stop: 99, target1: 110 },
  scenarios: [
    { label: 'bull', probability: 55 },
    { label: 'bear', probability: 45 },
  ],
  decision_reason: REASON,
  comment: '测试用提交',
};

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
    await bridge?.submit({ sessionId: 'run-1', submission: SUBMISSION, entryMode: 'limit' });
    await bridge?.step({ sessionId: 'run-1', action: { type: 'hold', bars: 3 } });
    await bridge?.amend({ sessionId: 'run-1', stop: 100.5, reason: REASON });
    await bridge?.cancel({ sessionId: 'run-1', reason: REASON });
    await bridge?.exitNextOpen({ sessionId: 'run-1', reason: REASON });
    await bridge?.reveal({ sessionId: 'run-1' });

    expect(invoke.mock.calls).toEqual([
      ['trainer.listPool'],
      ['trainer.open', { basePeriod: '5m' }],
      ['trainer.resume', { sessionId: 'run-1' }],
      ['trainer.submit', { sessionId: 'run-1', submission: SUBMISSION, entryMode: 'limit' }],
      ['trainer.step', { sessionId: 'run-1', action: { type: 'hold', bars: 3 } }],
      ['trainer.amend', { sessionId: 'run-1', stop: 100.5, reason: REASON }],
      ['trainer.cancel', { sessionId: 'run-1', reason: REASON }],
      ['trainer.exitNextOpen', { sessionId: 'run-1', reason: REASON }],
      ['trainer.reveal', { sessionId: 'run-1' }],
    ]);
  });
});
