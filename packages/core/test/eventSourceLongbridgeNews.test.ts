import type { NewsItem } from '@kansoku/shared/types';
import { describe, expect, it, vi } from 'vitest';
import {
  createLongbridgeNewsAdapter,
  LONGBRIDGE_NEWS_SOURCE,
} from '../src/events/sources/longbridgeNews.js';

function news(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: '1001',
    title: '英伟达发布新一代加速卡',
    published_at: '2026-08-20T13:00:00Z',
    url: 'https://news.example.com/1001',
    ...overrides,
  };
}

interface Feeds {
  [symbol: string]: NewsItem[] | Error;
}

function adapter(feeds: Feeds, symbols: string[], extra: { limit?: number } = {}) {
  const seen: string[] = [];
  const instance = createLongbridgeNewsAdapter({
    symbols: async () => symbols,
    getNews: async (symbol) => {
      seen.push(symbol);
      const feed = feeds[symbol] ?? [];
      if (feed instanceof Error) throw feed;
      return feed;
    },
    ...extra,
  });
  return { instance, seen };
}

describe('longbridge news event adapter', () => {
  it('registers a positive polling interval under its own source name', () => {
    const { instance } = adapter({}, []);
    expect(instance.source).toBe(LONGBRIDGE_NEWS_SOURCE);
    expect(instance.intervalMs).toBeGreaterThan(0);
    expect(typeof instance.poll).toBe('function');
  });

  it('turns each headline into a news draft keyed by the source news id', async () => {
    const { instance } = adapter({ 'NVDA.US': [news()] }, ['NVDA.US']);

    const { drafts } = await instance.poll!({ cursor: null });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      class: 'news',
      dedupeKey: '1001',
      occurredAt: '2026-08-20T13:00:00.000Z',
      source: LONGBRIDGE_NEWS_SOURCE,
      symbols: ['NVDA.US'],
      trust: 'verified',
    });
    expect(drafts[0].payload.title).toBe('英伟达发布新一代加速卡');
    expect(drafts[0].payload.url).toBe('https://news.example.com/1001');
    expect(drafts[0].payload.data).toMatchObject({ publishedAt: '2026-08-20T13:00:00Z' });
  });

  it('polls every watchlist and position symbol it is handed', async () => {
    const { instance, seen } = adapter(
      { 'MU.US': [news({ id: '2' })], 'NVDA.US': [news({ id: '1' })] },
      ['NVDA.US', 'MU.US'],
    );

    const { drafts } = await instance.poll!({ cursor: null });

    expect(seen).toEqual(['NVDA.US', 'MU.US']);
    expect(drafts.map((d) => d.dedupeKey).sort()).toEqual(['1', '2']);
  });

  it('does not call the news API at all when there is nothing to watch', async () => {
    const getNews = vi.fn();
    const instance = createLongbridgeNewsAdapter({ getNews, symbols: async () => [] });

    const result = await instance.poll!({ cursor: null });

    expect(getNews).not.toHaveBeenCalled();
    expect(result.drafts).toEqual([]);
    expect(result.cursor).toBeUndefined();
  });

  it('reports one event carrying both symbols when a headline covers two names', async () => {
    const shared = news({ id: 'shared-1' });
    const { instance } = adapter({ 'MU.US': [shared], 'NVDA.US': [shared] }, ['NVDA.US', 'MU.US']);

    const { drafts } = await instance.poll!({ cursor: null });

    expect(drafts).toHaveLength(1);
    expect(drafts[0].symbols).toEqual(['NVDA.US', 'MU.US']);
  });

  it('remembers the newest headline per symbol so a restart does not replay it', async () => {
    const first = adapter(
      {
        'MU.US': [news({ id: 'm1', published_at: '2026-08-20T09:00:00Z' })],
        'NVDA.US': [
          news({ id: 'n1', published_at: '2026-08-20T12:00:00Z' }),
          news({ id: 'n2', published_at: '2026-08-20T13:00:00Z' }),
        ],
      },
      ['NVDA.US', 'MU.US'],
    );

    const round1 = await first.instance.poll!({ cursor: null });
    expect(round1.drafts).toHaveLength(3);
    expect(typeof round1.cursor).toBe('string');

    // A fresh adapter instance, as after a restart: only the stored cursor can
    // stop the same three headlines from being ingested again.
    const second = adapter(
      {
        'MU.US': [news({ id: 'm1', published_at: '2026-08-20T09:00:00Z' })],
        'NVDA.US': [
          news({ id: 'n1', published_at: '2026-08-20T12:00:00Z' }),
          news({ id: 'n2', published_at: '2026-08-20T13:00:00Z' }),
          news({ id: 'n3', published_at: '2026-08-20T14:00:00Z' }),
        ],
      },
      ['NVDA.US', 'MU.US'],
    );

    const round2 = await second.instance.poll!({ cursor: round1.cursor! });

    expect(round2.drafts.map((d) => d.dedupeKey)).toEqual(['n3']);
  });

  it('tracks a cursor per symbol, so a quiet name is not skipped by a busy one', async () => {
    const first = adapter(
      { 'MU.US': [], 'NVDA.US': [news({ id: 'n1', published_at: '2026-08-20T13:00:00Z' })] },
      ['NVDA.US', 'MU.US'],
    );
    const round1 = await first.instance.poll!({ cursor: null });

    const second = adapter(
      {
        'MU.US': [news({ id: 'm1', published_at: '2026-08-20T10:00:00Z' })],
        'NVDA.US': [news({ id: 'n1', published_at: '2026-08-20T13:00:00Z' })],
      },
      ['NVDA.US', 'MU.US'],
    );
    const round2 = await second.instance.poll!({ cursor: round1.cursor! });

    expect(round2.drafts.map((d) => d.dedupeKey)).toEqual(['m1']);
  });

  it('starts over rather than throwing when the stored cursor is unreadable', async () => {
    const { instance } = adapter({ 'NVDA.US': [news()] }, ['NVDA.US']);

    const { drafts } = await instance.poll!({ cursor: 'not-json-at-all' });

    expect(drafts.map((d) => d.dedupeKey)).toEqual(['1001']);
  });

  it('drops a headline with an unusable timestamp instead of dating it now', async () => {
    const { instance } = adapter(
      {
        'NVDA.US': [
          news({ id: 'bad', published_at: 'sometime last week' }),
          news({ id: 'good', published_at: '2026-08-20T13:00:00Z' }),
        ],
      },
      ['NVDA.US'],
    );

    const { drafts } = await instance.poll!({ cursor: null });

    expect(drafts.map((d) => d.dedupeKey)).toEqual(['good']);
  });

  it('still delivers the symbols that answered when one symbol fails', async () => {
    const { instance } = adapter(
      { 'MU.US': [news({ id: 'm1' })], 'NVDA.US': new Error('longbridge cli exploded') },
      ['NVDA.US', 'MU.US'],
    );

    const { drafts } = await instance.poll!({ cursor: null });

    expect(drafts.map((d) => d.dedupeKey)).toEqual(['m1']);
  });

  it('fails the whole cycle when no watched symbol could be read, so the source degrades', async () => {
    const { instance } = adapter({ 'MU.US': new Error('down'), 'NVDA.US': new Error('down') }, [
      'NVDA.US',
      'MU.US',
    ]);

    await expect(instance.poll!({ cursor: null })).rejects.toThrow(/news/i);
  });

  it('fails the cycle when the watch list itself cannot be read', async () => {
    const instance = createLongbridgeNewsAdapter({
      getNews: async () => [],
      symbols: async () => {
        throw new Error('broker offline');
      },
    });

    await expect(instance.poll!({ cursor: null })).rejects.toThrow('broker offline');
  });

  it('asks for the configured page size per symbol', async () => {
    const getNews = vi.fn(async () => [] as NewsItem[]);
    const instance = createLongbridgeNewsAdapter({
      getNews,
      limit: 15,
      symbols: async () => ['NVDA.US'],
    });

    await instance.poll!({ cursor: null });

    expect(getNews).toHaveBeenCalledWith('NVDA.US', 15);
  });
});
