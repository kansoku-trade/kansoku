import { describe, expect, it } from 'vitest';
import type { MarketEventDraft } from '../src/events/types.js';
import {
  buildDedupeKey,
  deriveEventId,
  pickClusterId,
  resolveCluster,
} from '../src/events/identity.js';

function draft(overrides: Partial<MarketEventDraft> = {}): MarketEventDraft {
  return {
    source: 'sec-edgar',
    class: 'filing',
    kind: 'form-4',
    symbols: ['NVDA.US'],
    occurredAt: '2026-08-20T13:00:00.000Z',
    observedAt: '2026-08-20T13:00:30.000Z',
    trust: 'official',
    severity: 'notable',
    payload: { title: '内部人卖出 12 万股' },
    ...overrides,
  };
}

describe('buildDedupeKey', () => {
  it('returns the same key for two identical drafts', () => {
    expect(buildDedupeKey(draft())).toBe(buildDedupeKey(draft()));
  });

  it('uses an adapter-supplied dedupeKey verbatim', () => {
    expect(buildDedupeKey(draft({ dedupeKey: 'accession:0001-24-000123' }))).toBe(
      'accession:0001-24-000123',
    );
  });

  it('ignores observedAt so a re-poll of the same event is not a new event', () => {
    expect(buildDedupeKey(draft({ observedAt: '2026-08-20T19:44:00.000Z' }))).toBe(
      buildDedupeKey(draft()),
    );
  });

  it('separates drafts that differ in kind, occurredAt, symbols, or title', () => {
    const base = buildDedupeKey(draft());
    expect(buildDedupeKey(draft({ kind: 'form-8k' }))).not.toBe(base);
    expect(buildDedupeKey(draft({ occurredAt: '2026-08-20T13:01:00.000Z' }))).not.toBe(base);
    expect(buildDedupeKey(draft({ symbols: ['AMD.US'] }))).not.toBe(base);
    expect(buildDedupeKey(draft({ payload: { title: '内部人买入 3 万股' } }))).not.toBe(base);
  });

  it('treats symbol order and casing as the same event', () => {
    expect(buildDedupeKey(draft({ symbols: ['amd.us', 'NVDA.US'] }))).toBe(
      buildDedupeKey(draft({ symbols: ['NVDA.US', 'AMD.US'] })),
    );
  });
});

describe('deriveEventId', () => {
  it('is stable across calls so a restart re-derives the same id', () => {
    expect(deriveEventId('sec-edgar', 'k1')).toBe(deriveEventId('sec-edgar', 'k1'));
  });

  it('scopes the id to the source so two sources never collide on one key', () => {
    expect(deriveEventId('sec-edgar', 'k1')).not.toBe(deriveEventId('gdelt', 'k1'));
  });

  it('produces a compact hex id', () => {
    expect(deriveEventId('sec-edgar', 'k1')).toMatch(/^[\da-f]{24}$/);
  });
});

describe('pickClusterId', () => {
  const candidate = {
    id: 'existing-id',
    clusterId: 'cluster-a',
    source: 'gdelt',
    class: 'filing' as const,
    symbols: ['NVDA.US'],
    occurredAt: '2026-08-20T12:50:00.000Z',
  };

  it('starts its own cluster when nothing else is nearby', () => {
    expect(pickClusterId(draft(), [])).toBe(deriveEventId('sec-edgar', buildDedupeKey(draft())));
  });

  it('joins a different source covering the same symbol inside the window', () => {
    expect(pickClusterId(draft(), [candidate])).toBe('cluster-a');
  });

  it('does not join a candidate from the same source', () => {
    expect(pickClusterId(draft(), [{ ...candidate, source: 'sec-edgar' }])).not.toBe('cluster-a');
  });

  it('does not join a candidate outside the time window', () => {
    expect(
      pickClusterId(draft(), [{ ...candidate, occurredAt: '2026-08-20T10:00:00.000Z' }]),
    ).not.toBe('cluster-a');
  });

  it('does not join a candidate with no overlapping symbol', () => {
    expect(pickClusterId(draft(), [{ ...candidate, symbols: ['AAPL.US'] }])).not.toBe('cluster-a');
  });

  it('joins a candidate of a different class: a filing and its coverage are one story', () => {
    expect(pickClusterId(draft(), [{ ...candidate, class: 'news' }])).toBe('cluster-a');
  });

  it('leaves a symbol-less macro event in its own cluster', () => {
    const macro = draft({ class: 'macro', symbols: [], source: 'fred' });
    expect(
      pickClusterId(macro, [{ ...candidate, class: 'macro', symbols: [], source: 'gdelt' }]),
    ).toBe(deriveEventId('fred', buildDedupeKey(macro)));
  });

  it('picks the earliest matching candidate so the choice does not depend on input order', () => {
    const later = {
      ...candidate,
      clusterId: 'cluster-late',
      occurredAt: '2026-08-20T12:59:00.000Z',
    };
    const earlier = {
      ...candidate,
      clusterId: 'cluster-early',
      occurredAt: '2026-08-20T12:45:00.000Z',
    };
    expect(pickClusterId(draft(), [later, earlier])).toBe('cluster-early');
    expect(pickClusterId(draft(), [earlier, later])).toBe('cluster-early');
  });

  it('matches symbols regardless of casing', () => {
    expect(pickClusterId(draft({ symbols: ['nvda.us'] }), [candidate])).toBe('cluster-a');
  });
});

describe('resolveCluster', () => {
  const nvda = {
    id: 'nvda-id',
    clusterId: 'cluster-nvda',
    source: 'gdelt',
    class: 'news' as const,
    symbols: ['NVDA.US'],
    occurredAt: '2026-08-20T12:50:00.000Z',
  };
  const amd = {
    id: 'amd-id',
    clusterId: 'cluster-amd',
    source: 'fred',
    class: 'news' as const,
    symbols: ['AMD.US'],
    occurredAt: '2026-08-20T13:10:00.000Z',
  };

  it('has nothing to merge when it started its own cluster', () => {
    expect(resolveCluster(draft(), [])).toEqual({
      clusterId: deriveEventId('sec-edgar', buildDedupeKey(draft())),
      mergeFrom: [],
    });
  });

  it('has nothing to merge when every match already shares one cluster', () => {
    expect(resolveCluster(draft(), [nvda, { ...nvda, id: 'other', source: 'fred' }])).toEqual({
      clusterId: 'cluster-nvda',
      mergeFrom: [],
    });
  });

  it('reports the losing clusters when an event bridges two of them', () => {
    const bridging = draft({ symbols: ['NVDA.US', 'AMD.US'] });
    expect(resolveCluster(bridging, [amd, nvda])).toEqual({
      clusterId: 'cluster-nvda',
      mergeFrom: ['cluster-amd'],
    });
    // Same answer whichever order the rows came back in, so a re-run cannot flip
    // which cluster survives.
    expect(resolveCluster(bridging, [nvda, amd])).toEqual({
      clusterId: 'cluster-nvda',
      mergeFrom: ['cluster-amd'],
    });
  });

  it('breaks a timestamp tie on the cluster id so the winner is stable', () => {
    const tied = { ...amd, occurredAt: nvda.occurredAt, clusterId: 'cluster-a-tied' };
    const bridging = draft({ symbols: ['NVDA.US', 'AMD.US'] });
    expect(resolveCluster(bridging, [nvda, tied])).toEqual({
      clusterId: 'cluster-a-tied',
      mergeFrom: ['cluster-nvda'],
    });
    expect(resolveCluster(bridging, [tied, nvda])).toEqual({
      clusterId: 'cluster-a-tied',
      mergeFrom: ['cluster-nvda'],
    });
  });
});
