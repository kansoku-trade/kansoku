import type { HomeEventItem, HomeEvents } from '@kansoku/shared/types';
import { describe, expect, it, vi } from 'vitest';
import { createCalendarAdapter, MARKET_CALENDAR_SOURCE } from '../src/events/sources/calendar.js';

function earnings(overrides: Partial<HomeEventItem> = {}): HomeEventItem {
  return {
    actual: null,
    date: '2026-08-27',
    estimate: null,
    kind: 'earnings',
    owned: true,
    previous: null,
    sourceId: null,
    symbol: 'NVDA.US',
    title: 'NVDA 2027 财年 Q2 财报',
    ts: null,
    ...overrides,
  };
}

function macro(overrides: Partial<HomeEventItem> = {}): HomeEventItem {
  return {
    actual: null,
    date: '2026-08-21',
    estimate: '2.9%',
    kind: 'macro',
    owned: false,
    previous: '3.0%',
    sourceId: 'usa-cpi-yoy-202607',
    symbol: null,
    title: '美国7月CPI年率',
    ts: '2026-08-21T12:30:00Z',
    ...overrides,
  };
}

function adapter(
  items: HomeEventItem[],
  extra: { failures?: string[]; onDiagnostic?: (note: string) => void } = {},
) {
  const home: HomeEvents = { date: '2026-08-20', items };
  return createCalendarAdapter({
    loadHomeEvents: async () => ({ events: home, failures: extra.failures ?? [] }),
    ...(extra.onDiagnostic ? { onDiagnostic: extra.onDiagnostic } : {}),
  });
}

describe('market calendar event adapter', () => {
  it('polls on its own cadence under its own source name', () => {
    const instance = adapter([]);
    expect(instance.source).toBe(MARKET_CALENDAR_SOURCE);
    expect(instance.intervalMs).toBeGreaterThan(0);
  });

  it('turns an upcoming earnings date into an earnings event keyed by symbol and date', async () => {
    const { drafts } = await adapter([earnings()]).poll!({ cursor: null });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      class: 'earnings',
      dedupeKey: 'earnings|NVDA.US|2026-08-27',
      kind: 'earnings_scheduled',
      source: MARKET_CALENDAR_SOURCE,
      symbols: ['NVDA.US'],
      trust: 'official',
    });
    expect(drafts[0].payload.data).toMatchObject({ date: '2026-08-27', owned: true });
  });

  it('prefers the calendar own id for earnings when it has one', async () => {
    const { drafts } = await adapter([earnings({ sourceId: 'lb-nvda-fy27q2' })]).poll!({
      cursor: null,
    });
    expect(drafts[0].dedupeKey).toBe('earnings|lb-nvda-fy27q2');
  });

  it('keeps the earnings identity even after the calendar rewords the title', async () => {
    const first = await adapter([earnings()]).poll!({ cursor: null });
    const second = await adapter([earnings({ title: '英伟达 FY27Q2 业绩' })]).poll!({
      cursor: null,
    });

    expect(second.drafts[0].dedupeKey).toBe(first.drafts[0].dedupeKey);
    expect(second.drafts[0].payload.title).toBe('英伟达 FY27Q2 业绩');
  });

  it('drops an earnings row with no symbol rather than filing an unidentifiable event', async () => {
    const { drafts } = await adapter([earnings({ symbol: null })]).poll!({ cursor: null });
    expect(drafts).toEqual([]);
  });

  it('files a scheduled macro release keyed by the provider id, never by the title', async () => {
    const { drafts } = await adapter([macro()]).poll!({ cursor: null });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      class: 'macro',
      dedupeKey: 'macro|scheduled|usa-cpi-yoy-202607',
      kind: 'macro_scheduled',
      occurredAt: '2026-08-21T12:30:00.000Z',
      severity: 'info',
      symbols: [],
      trust: 'official',
    });
    expect(drafts[0].payload.data).toMatchObject({ estimate: '2.9%', previous: '3.0%' });
  });

  it('files a printed macro number as its own notable event, separate from the schedule', async () => {
    const { drafts } = await adapter([macro(), macro({ actual: '3.2%' })]).poll!({ cursor: null });

    const kinds = drafts.map((d) => d.kind).sort();
    expect(kinds).toEqual(['macro_released', 'macro_scheduled']);
    const released = drafts.find((d) => d.kind === 'macro_released')!;
    expect(released.severity).toBe('notable');
    expect(released.dedupeKey).toBe('macro|released|usa-cpi-yoy-202607');
    expect(released.payload.data).toMatchObject({ actual: '3.2%' });
  });

  it('keeps the macro identity when the title starts carrying the printed value', async () => {
    const bare = await adapter([macro({ actual: '3.2%' })]).poll!({ cursor: null });
    const decorated = await adapter([
      macro({ actual: '3.2%', title: '美国7月CPI年率（实际 3.2%，预期 2.9%）' }),
    ]).poll!({ cursor: null });

    expect(decorated.drafts[0].dedupeKey).toBe(bare.drafts[0].dedupeKey);
  });

  it('keeps the scheduled identity stable when the estimate is revised', async () => {
    const before = await adapter([macro()]).poll!({ cursor: null });
    const after = await adapter([macro({ estimate: '2.7%' })]).poll!({ cursor: null });

    expect(after.drafts[0].dedupeKey).toBe(before.drafts[0].dedupeKey);
  });

  it('drops a macro row with no provider id and says so, rather than inventing one', async () => {
    const notes: string[] = [];
    const { drafts } = await adapter([macro({ sourceId: null })], {
      onDiagnostic: (note) => notes.push(note),
    }).poll!({ cursor: null });

    expect(drafts).toEqual([]);
    expect(notes.join(' ')).toMatch(/macro/i);
  });

  it('does not let two ids at one instant collapse into a single row', async () => {
    const { drafts } = await adapter([
      macro({ sourceId: 'a', title: '美国7月CPI年率' }),
      macro({ sourceId: 'b', title: '美国7月核心CPI年率' }),
    ]).poll!({ cursor: null });

    expect(drafts.map((d) => d.dedupeKey).sort()).toEqual([
      'macro|scheduled|a',
      'macro|scheduled|b',
    ]);
  });

  it('treats a placeholder actual as "not printed yet"', async () => {
    for (const placeholder of ['', '  ', '-', '--']) {
      const { drafts } = await adapter([macro({ actual: placeholder })]).poll!({ cursor: null });
      expect(drafts.map((d) => d.kind)).toEqual(['macro_scheduled']);
    }
  });

  it('places a date-only row at midday Eastern, not at midnight UTC', async () => {
    const { drafts } = await adapter([earnings()]).poll!({ cursor: null });

    // Midnight UTC on 2026-08-27 is 8pm on the 26th in New York, which would file a
    // report on the wrong day for the market it belongs to.
    expect(drafts[0].occurredAt).toBe('2026-08-27T16:00:00.000Z');
    expect(drafts[0].payload.data).toMatchObject({ date: '2026-08-27', datePrecision: 'date' });
  });

  it('falls back to the calendar date when the release instant is unusable', async () => {
    const { drafts } = await adapter([macro({ ts: 'to be announced' })]).poll!({ cursor: null });
    expect(drafts[0].occurredAt).toBe('2026-08-21T16:00:00.000Z');
  });

  it('drops a row whose date and instant are both unusable', async () => {
    const { drafts } = await adapter([macro({ date: 'soon', ts: null })]).poll!({ cursor: null });
    expect(drafts).toEqual([]);
  });

  it('collapses a row the calendar returned twice into one draft', async () => {
    const { drafts } = await adapter([earnings(), earnings()]).poll!({ cursor: null });
    expect(drafts).toHaveLength(1);
  });

  it('leaves the stored cursor alone, since every poll re-reads the whole window', async () => {
    const result = await adapter([earnings()]).poll!({ cursor: 'anything' });
    expect(result.cursor).toBeUndefined();
  });

  it('reports a partly failed upstream read without dropping the rows that arrived', async () => {
    const notes: string[] = [];
    const { drafts } = await adapter([macro()], {
      failures: ['macro US — calendar down'],
      onDiagnostic: (note) => notes.push(note),
    }).poll!({ cursor: null });

    expect(drafts).toHaveLength(1);
    expect(notes.join(' ')).toContain('calendar down');
  });

  it('fails the cycle when the calendar cannot be read, so the source degrades', async () => {
    const instance = createCalendarAdapter({
      loadHomeEvents: async () => {
        throw new Error('calendar provider unavailable');
      },
    });

    await expect(instance.poll!({ cursor: null })).rejects.toThrow('calendar provider unavailable');
  });

  it('warns through the console when no diagnostic sink is supplied', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await adapter([macro({ sourceId: null })]).poll!({ cursor: null });
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
