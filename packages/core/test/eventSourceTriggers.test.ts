import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectTriggers } from '../src/ai/personas/triggers.js';
import type { EventPollResult } from '../src/events/registry.js';
import {
  createTriggerAdapter,
  KERNEL_TRIGGER_SOURCE,
  onTriggerObservation,
  publishTriggerObservation,
  triggerObservationListenerCount,
  type TriggerObservation,
} from '../src/events/sources/triggerBus.js';

const detach: (() => void)[] = [];

afterEach(() => {
  for (const stop of detach.splice(0)) stop();
});

function attach() {
  const emitted: EventPollResult[] = [];
  const failures: unknown[] = [];
  const adapter = createTriggerAdapter();
  const stop = adapter.subscribe!({
    cursor: null,
    emit: (result) => emitted.push(result),
    fail: (error) => failures.push(error),
  }) as () => void;
  detach.push(stop);
  return { adapter, emitted, failures, stop };
}

describe('kernel trigger observation bus', () => {
  it('delivers a published observation to every listener and stops on unsubscribe', () => {
    const seen: string[] = [];
    const off = onTriggerObservation((observation) => seen.push(observation.symbol));

    publishTriggerObservation({
      occurredAt: '2026-08-20T13:00:00Z',
      symbol: 'NVDA.US',
      triggers: [{ detail: 'MACD histogram flipped golden', kind: 'macd_cross' }],
    });
    expect(seen).toEqual(['NVDA.US']);

    off();
    publishTriggerObservation({
      occurredAt: '2026-08-20T13:05:00Z',
      symbol: 'MU.US',
      triggers: [{ detail: 'MACD histogram flipped death', kind: 'macd_cross' }],
    });
    expect(seen).toEqual(['NVDA.US']);
    expect(triggerObservationListenerCount()).toBe(0);
  });

  it('keeps delivering to the remaining listeners when one of them throws', () => {
    const seen: string[] = [];
    const offBad = onTriggerObservation(() => {
      throw new Error('listener is broken');
    });
    const offGood = onTriggerObservation((observation) => seen.push(observation.symbol));

    expect(() =>
      publishTriggerObservation({
        occurredAt: '2026-08-20T13:00:00Z',
        symbol: 'NVDA.US',
        triggers: [{ detail: 'volume spike', kind: 'volume_spike' }],
      }),
    ).not.toThrow();
    expect(seen).toEqual(['NVDA.US']);

    offBad();
    offGood();
  });

  it('leaves detectTriggers a pure function that publishes nothing', () => {
    const listener = vi.fn();
    const off = onTriggerObservation(listener);

    const triggers = detectTriggers({
      bars: [
        { close: 100, time: 1, volume: 10 },
        { close: 120, time: 2, volume: 10 },
      ],
      flow: [],
      levels: { entry: 110 },
      macdHist: [],
    });

    expect(triggers.map((t) => t.kind)).toEqual(['level_break']);
    expect(listener).not.toHaveBeenCalled();
    off();
  });
});

describe('kernel trigger event adapter', () => {
  it('is a subscription source with its own name', () => {
    const { adapter } = attach();
    expect(adapter.source).toBe(KERNEL_TRIGGER_SOURCE);
    expect(typeof adapter.subscribe).toBe('function');
    expect(adapter.poll).toBeUndefined();
  });

  it('emits one draft per detected trigger, keyed by symbol, kind and time', () => {
    const { emitted } = attach();

    publishTriggerObservation({
      occurredAt: '2026-08-20T13:00:00Z',
      symbol: 'nvda.us',
      triggers: [
        { detail: 'MACD histogram flipped golden (-1 -> 2)', kind: 'macd_cross' },
        { detail: 'Cumulative capital flow flipped to net inflow', kind: 'flow_flip' },
      ],
    });

    expect(emitted).toHaveLength(1);
    const drafts = emitted[0].drafts;
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      class: 'technical',
      dedupeKey: 'NVDA.US|macd_cross|2026-08-20T13:00:00.000Z',
      kind: 'macd_cross',
      occurredAt: '2026-08-20T13:00:00.000Z',
      severity: 'notable',
      source: KERNEL_TRIGGER_SOURCE,
      symbols: ['NVDA.US'],
    });
    expect(drafts[0].payload.title).toContain('MACD histogram flipped golden');
    // A money-flow flip is a flow event, not a chart pattern — the timeline filters
    // on class, so folding it into "technical" would hide it from the flow view.
    expect(drafts[1].class).toBe('flow');
  });

  it('keys two observations of the same bar identically', () => {
    const { emitted } = attach();
    const observation = {
      occurredAt: '2026-08-20T13:00:00Z',
      symbol: 'NVDA.US',
      triggers: [{ detail: 'broke prev_day_high', kind: 'level_break' as const }],
    };

    // Two polls of one candle. The scheduler dates both by that candle, so the store
    // sees one event instead of one per minute of polling.
    publishTriggerObservation(observation);
    publishTriggerObservation(observation);

    expect(emitted[0].drafts[0].dedupeKey).toBe(emitted[1].drafts[0].dedupeKey);
  });

  it('files a macro reaction under the macro class', () => {
    const { emitted } = attach();

    publishTriggerObservation({
      occurredAt: '2026-08-20T13:00:00Z',
      symbol: 'NVDA.US',
      triggers: [{ detail: 'CPI came in hot', kind: 'macro_react' }],
    });

    expect(emitted[0].drafts[0].class).toBe('macro');
  });

  it('drops an observation with no time instead of stamping it now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T13:30:00Z'));
    try {
      const { emitted, failures } = attach();
      // A trigger dated "when we noticed" is a trigger on the wrong bar, which is
      // worse on a timeline than one that never shows up.
      publishTriggerObservation({
        symbol: 'NVDA.US',
        triggers: [{ detail: 'volume spike', kind: 'volume_spike' }],
      } as unknown as TriggerObservation);
      expect(emitted).toEqual([]);
      expect(failures).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores an observation with no triggers rather than emitting an empty batch', () => {
    const { emitted } = attach();
    publishTriggerObservation({
      occurredAt: '2026-08-20T13:00:00Z',
      symbol: 'NVDA.US',
      triggers: [],
    });
    expect(emitted).toEqual([]);
  });

  it('drops an observation with no symbol or an unusable time instead of guessing', () => {
    const { emitted, failures } = attach();

    publishTriggerObservation({
      occurredAt: '2026-08-20T13:00:00Z',
      symbol: '   ',
      triggers: [{ detail: 'volume spike', kind: 'volume_spike' }],
    });
    publishTriggerObservation({
      occurredAt: 'yesterday afternoon',
      symbol: 'NVDA.US',
      triggers: [{ detail: 'volume spike', kind: 'volume_spike' }],
    });

    expect(emitted).toEqual([]);
    expect(failures).toEqual([]);
  });

  it('detaches from the bus when the runtime stops it, leaving no listener behind', () => {
    const before = triggerObservationListenerCount();
    const { emitted, stop } = attach();
    expect(triggerObservationListenerCount()).toBe(before + 1);

    stop();
    expect(triggerObservationListenerCount()).toBe(before);

    publishTriggerObservation({
      occurredAt: '2026-08-20T13:00:00Z',
      symbol: 'NVDA.US',
      triggers: [{ detail: 'volume spike', kind: 'volume_spike' }],
    });
    expect(emitted).toEqual([]);
  });
});
