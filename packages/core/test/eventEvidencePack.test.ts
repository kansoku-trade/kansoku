import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarketEvent } from '@kansoku/shared/types';
import { createDb, type Db } from '../src/db/index.js';
import type { MarketEventDraft } from '../src/events/types.js';
import { ingestEvent } from '../src/events/store.js';
import { buildEventEvidencePack } from '../src/events/evidencePack.js';

const open: Db[] = [];

function db(): Db {
  const instance = createDb(':memory:');
  open.push(instance);
  return instance;
}

function draft(overrides: Partial<MarketEventDraft> = {}): MarketEventDraft {
  return {
    source: 'sec-edgar',
    class: 'filing',
    kind: '8-K',
    symbols: ['MU.US'],
    occurredAt: '2026-08-20T14:00:00.000Z',
    observedAt: '2026-08-20T14:00:12.000Z',
    trust: 'official',
    severity: 'notable',
    payload: {
      title: 'Micron 8-K',
      summary: '供货协议',
      url: 'https://sec.gov/mu-8k',
    },
    ...overrides,
  };
}

function bar(time: string, close: number, volume: number) {
  return { time, open: close, high: close, low: close, close, volume };
}

afterEach(() => {
  for (const instance of open.splice(0)) instance.$client.close();
});

describe('buildEventEvidencePack', () => {
  it('leads with the primary event and then official cluster siblings', async () => {
    const instance = db();
    const primary = await ingestEvent(draft(), instance);
    await ingestEvent(
      draft({
        source: 'longbridge-news',
        trust: 'unverified',
        occurredAt: '2026-08-20T14:05:00.000Z',
        payload: { title: '路透转述', url: 'https://news.example/mu' },
      }),
      instance,
    );
    await ingestEvent(
      draft({
        source: 'fed-press',
        class: 'news',
        trust: 'verified',
        occurredAt: '2026-08-20T14:02:00.000Z',
        payload: { title: '经纪商快讯', url: 'https://wire.example/mu' },
      }),
      instance,
    );

    const pack = await buildEventEvidencePack(primary.event.id, {
      db: instance,
      now: () => new Date('2026-08-20T15:00:00.000Z'),
      fetchKline: async () => [],
      fetchFlow: async () => [],
      listComments: async () => [],
      listResearch: async () => [],
    });

    expect(pack.event.id).toBe(primary.event.id);
    expect(pack.slug).toBe(`event-${primary.event.id}`);
    expect(pack.cluster.map((event) => event.trust)).toEqual(['official', 'verified', 'unverified']);
    expect(pack.items[0]).toMatchObject({
      kind: 'primary',
      url: 'https://sec.gov/mu-8k',
      occurredAt: '2026-08-20T14:00:00.000Z',
      observedAt: '2026-08-20T14:00:12.000Z',
    });
    expect(pack.items.filter((item) => item.kind === 'cluster').map((item) => item.title)).toEqual([
      '经纪商快讯',
      '路透转述',
    ]);
  });

  it('keeps URL and both clocks on every evidence item', async () => {
    const instance = db();
    const { event } = await ingestEvent(draft(), instance);
    const pack = await buildEventEvidencePack(event.id, {
      db: instance,
      now: () => new Date('2026-08-20T15:00:00.000Z'),
      fetchKline: async () => [
        bar('2026-08-20T13:50:00.000Z', 100, 10),
        bar('2026-08-20T14:00:00.000Z', 101, 20),
        bar('2026-08-20T14:10:00.000Z', 99, 40),
      ],
      fetchFlow: async () => [{ time: '2026-08-20T14:00:00.000Z', inflow: 12 }],
      listComments: async () => [
        {
          ts: '2026-08-20T14:20:00.000Z',
          symbol: 'MU.US',
          level: 'info',
          text: '量能跟上了',
          source: 'commentator',
        },
      ],
      listResearch: async () => [
        {
          path: 'stocks/MU.md',
          title: 'MU 档案',
          excerpt: '存储周期',
          mtime: '2026-08-19T10:00:00.000Z',
        },
      ],
    });

    for (const item of pack.items) {
      expect(item.occurredAt).toMatch(/T/);
      expect(item.observedAt).toMatch(/T/);
    }
    expect(pack.items.some((item) => item.kind === 'price')).toBe(true);
    expect(pack.items.some((item) => item.kind === 'volume')).toBe(true);
    expect(pack.items.some((item) => item.kind === 'flow')).toBe(true);
    expect(pack.items.some((item) => item.kind === 'comment')).toBe(true);
    expect(pack.items.some((item) => item.kind === 'research')).toBe(true);
  });

  it('still builds a pack for a macro event with no symbols', async () => {
    const instance = db();
    const { event } = await ingestEvent(
      draft({
        source: 'bls-rss',
        class: 'macro',
        symbols: [],
        payload: { title: 'CPI 公布', url: 'https://bls.gov/cpi' },
      }),
      instance,
    );
    const fetchKline = vi.fn(async (symbol: string) => {
      if (symbol === 'SPY.US') return [bar('2026-08-20T14:00:00.000Z', 500, 100)];
      throw new Error(`unexpected symbol ${symbol}`);
    });

    const pack = await buildEventEvidencePack(event.id, {
      db: instance,
      now: () => new Date('2026-08-20T15:00:00.000Z'),
      fetchKline,
      fetchFlow: async () => {
        throw new Error('macro has no flow');
      },
      listComments: async () => [],
      listResearch: async () => [],
    });

    expect(pack.event.symbols).toEqual([]);
    expect(pack.items[0].kind).toBe('primary');
    expect(pack.items.some((item) => item.kind === 'peer')).toBe(true);
    expect(fetchKline).toHaveBeenCalledWith('SPY.US', '5m', expect.any(Number));
  });

  it('omits a failed market-data slice instead of failing the pack', async () => {
    const instance = db();
    const { event } = await ingestEvent(draft(), instance);
    const pack = await buildEventEvidencePack(event.id, {
      db: instance,
      now: () => new Date('2026-08-20T15:00:00.000Z'),
      fetchKline: async () => {
        throw new Error('longbridge down');
      },
      fetchFlow: async () => {
        throw new Error('flow down');
      },
      listComments: async () => [],
      listResearch: async () => [],
    });

    expect(pack.event.id).toBe(event.id);
    expect(pack.items.some((item) => item.kind === 'price' || item.kind === 'flow')).toBe(false);
  });

  it('uses daily bars when the event is older than the 5m window', async () => {
    const instance = db();
    const { event } = await ingestEvent(
      draft({ occurredAt: '2026-08-19T18:00:00.000Z', observedAt: '2026-08-19T18:00:00.000Z' }),
      instance,
    );
    const fetchKline = vi.fn(async (_symbol: string, period: string) => {
      if (period === '5m') return [bar('2026-08-27T18:20:00.000Z', 770, 100)];
      if (period === 'day') {
        return [
          bar('2026-08-18T00:00:00.000Z', 640, 10),
          bar('2026-08-19T00:00:00.000Z', 642, 20),
          bar('2026-08-20T00:00:00.000Z', 638, 30),
        ];
      }
      throw new Error(`unexpected period ${period}`);
    });

    const pack = await buildEventEvidencePack(event.id, {
      db: instance,
      now: () => new Date('2026-08-28T15:46:00.000Z'),
      fetchKline,
      fetchFlow: async () => [],
      listComments: async () => [],
      listResearch: async () => [],
    });

    expect(fetchKline).toHaveBeenCalledWith('MU.US', 'day', expect.any(Number));
    const price = pack.items.find((item) => item.kind === 'price');
    expect(price?.data).toMatchObject({
      coverage: 'event-window',
      first: { time: '2026-08-18T00:00:00.000Z' },
      last: { time: '2026-08-20T00:00:00.000Z' },
    });
    expect(JSON.stringify(price?.data)).not.toContain('2026-08-27');
  });

  it('records a missing event-day window instead of handing over later bars', async () => {
    const instance = db();
    const { event } = await ingestEvent(
      draft({
        source: 'fed-monetary',
        class: 'policy',
        symbols: [],
        occurredAt: '2026-08-19T18:00:00.000Z',
        payload: { title: 'FOMC minutes', url: 'https://federalreserve.gov/minutes' },
      }),
      instance,
    );
    const pack = await buildEventEvidencePack(event.id, {
      db: instance,
      now: () => new Date('2026-08-28T15:46:00.000Z'),
      fetchKline: async () => [bar('2026-08-27T18:20:00.000Z', 770.09, 111880)],
      fetchFlow: async () => [],
      listComments: async () => [],
      listResearch: async () => [],
    });

    const market = pack.items.filter((item) => item.kind === 'peer' || item.kind === 'volume');
    expect(market).toHaveLength(1);
    expect(market[0]).toMatchObject({
      kind: 'peer',
      title: 'SPY.US 没有取到事件当日行情',
      data: { coverage: 'unavailable', symbol: 'SPY.US' },
    });
    expect(JSON.stringify(market[0].data)).not.toMatch(/770\.09/);
  });

  it('does not take a model or call AI', async () => {
    const instance = db();
    const { event } = await ingestEvent(draft(), instance);
    const pack = await buildEventEvidencePack(event.id, {
      db: instance,
      now: () => new Date('2026-08-20T15:00:00.000Z'),
      fetchKline: async () => [],
      fetchFlow: async () => [],
      listComments: async () => [],
      listResearch: async () => [],
    });
    expect(pack.items.every((item) => item.kind !== 'generated')).toBe(true);
  });

  it('rejects an unknown event', async () => {
    await expect(
      buildEventEvidencePack('missing', {
        db: db(),
        now: () => new Date(),
        fetchKline: async () => [],
        fetchFlow: async () => [],
        listComments: async () => [],
        listResearch: async () => [],
      }),
    ).rejects.toThrow(/not found/);
  });
});
