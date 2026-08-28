import { describe, expect, it } from 'vitest';
import type { MarketEvent } from '@kansoku/shared/types';
import { mergeMarketEvents, occurredAtOrBefore } from './eventFeed';

function evt(id: string, occurredAt: string, over: Partial<MarketEvent> = {}): MarketEvent {
  return {
    id,
    dedupeKey: `k-${id}`,
    clusterId: `c-${id}`,
    source: 'sec',
    class: 'filing',
    kind: '8-K',
    symbols: ['MU.US'],
    occurredAt,
    observedAt: occurredAt,
    trust: 'official',
    severity: 'notable',
    payload: { title: `title-${id}` },
    canvasSlug: null,
    ...over,
  };
}

describe('mergeMarketEvents', () => {
  it('orders the merged feed newest-first by occurredAt', () => {
    const merged = mergeMarketEvents(
      [evt('a', '2026-08-01T10:00:00.000Z')],
      [evt('b', '2026-08-01T12:00:00.000Z'), evt('c', '2026-08-01T08:00:00.000Z')],
    );
    expect(merged.map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('replaces an event resent under the same id instead of duplicating it', () => {
    const first = evt('a', '2026-08-01T10:00:00.000Z', { symbols: ['MU.US'] });
    const clustered = evt('a', '2026-08-01T10:00:00.000Z', {
      symbols: ['MU.US', 'NVDA.US'],
      severity: 'critical',
    });
    const merged = mergeMarketEvents([first], [clustered]);
    expect(merged).toHaveLength(1);
    expect(merged[0].symbols).toEqual(['MU.US', 'NVDA.US']);
    expect(merged[0].severity).toBe('critical');
  });

  it('caps the feed length and drops the oldest events first', () => {
    const current = Array.from({ length: 5 }, (_, i) =>
      evt(`e${i}`, `2026-08-0${i + 1}T00:00:00.000Z`),
    );
    const merged = mergeMarketEvents(current, [], 3);
    expect(merged.map((e) => e.id)).toEqual(['e4', 'e3', 'e2']);
  });

  it('keeps a deterministic order when two events share one occurredAt', () => {
    const a = evt('aaa', '2026-08-01T10:00:00.000Z');
    const b = evt('bbb', '2026-08-01T10:00:00.000Z');
    expect(mergeMarketEvents([a], [b]).map((e) => e.id)).toEqual(
      mergeMarketEvents([b], [a]).map((e) => e.id),
    );
  });
});

describe('occurredAtOrBefore', () => {
  it('keeps events that already happened and drops future-dated ones', () => {
    const now = Date.parse('2026-08-01T10:00:00.000Z');
    const past = evt('past', '2026-08-01T09:00:00.000Z');
    const future = evt('future', '2026-08-01T11:00:00.000Z');
    expect(occurredAtOrBefore([past, future], now).map((e) => e.id)).toEqual(['past']);
  });
});
