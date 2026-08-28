import type { NewsItem } from '@kansoku/shared/types';
import { describe, expect, it, vi } from 'vitest';
import {
  createLongbridgeNewsAdapter,
  NEWS_DEFAULT_PAGE_SIZE,
} from '../src/events/sources/longbridgeNews.js';

function news(id: string, publishedAt: string): NewsItem {
  return { id, title: `story ${id}`, published_at: publishedAt, url: `https://x/${id}` };
}

function adapter(feed: NewsItem[], extra: { maxSeenIds?: number; limit?: number } = {}) {
  return createLongbridgeNewsAdapter({
    getNews: async () => feed,
    symbols: async () => ['NVDA.US'],
    ...extra,
  });
}

describe('news cursor keeps a bounded set of seen ids', () => {
  it('asks for a page far larger than one screen of headlines', async () => {
    const getNews = vi.fn(async () => [] as NewsItem[]);
    const instance = createLongbridgeNewsAdapter({ getNews, symbols: async () => ['NVDA.US'] });

    await instance.poll!({ cursor: null });

    expect(NEWS_DEFAULT_PAGE_SIZE).toBeGreaterThanOrEqual(50);
    expect(getNews).toHaveBeenCalledWith('NVDA.US', NEWS_DEFAULT_PAGE_SIZE);
  });

  it('keeps every headline that shares a timestamp', async () => {
    const same = '2026-08-20T13:00:00Z';
    const first = adapter([news('a', same), news('b', same), news('c', same)]);

    const round1 = await first.poll!({ cursor: null });
    expect(round1.drafts.map((d) => d.dedupeKey)).toEqual(['a', 'b', 'c']);

    // A restart on the same page must not replay any of the three.
    const second = adapter([news('a', same), news('b', same), news('c', same)]);
    const round2 = await second.poll!({ cursor: round1.cursor! });
    expect(round2.drafts).toEqual([]);
  });

  it('ingests a backlog that is older than the newest headline it already saw', async () => {
    const first = adapter([news('new-1', '2026-08-20T14:00:00Z')]);
    const round1 = await first.poll!({ cursor: null });
    expect(round1.drafts.map((d) => d.dedupeKey)).toEqual(['new-1']);

    // While the app was down the page filled up with stories that are all older than
    // the headline we stopped at. A timestamp cursor would drop every one of them.
    const backlog = [
      news('new-1', '2026-08-20T14:00:00Z'),
      ...Array.from({ length: 25 }, (_, i) =>
        news(
          `back-${i}`,
          new Date(Date.parse('2026-08-20T09:00:00Z') + i * 60_000).toISOString(),
        ),
      ),
    ];
    const second = adapter(backlog);
    const round2 = await second.poll!({ cursor: round1.cursor! });

    expect(round2.drafts).toHaveLength(25);
    expect(round2.drafts.map((d) => d.dedupeKey)).not.toContain('new-1');
  });

  it('caps the stored ids so the cursor cannot grow without bound', async () => {
    const feed = Array.from({ length: 10 }, (_, i) =>
      news(`n${i}`, new Date(Date.parse('2026-08-20T10:00:00Z') + i * 60_000).toISOString()),
    );
    const instance = adapter(feed, { maxSeenIds: 3 });

    const { cursor } = await instance.poll!({ cursor: null });
    const parsed = JSON.parse(cursor!) as Record<string, { ids: string[] }>;

    expect(parsed['NVDA.US'].ids).toHaveLength(3);
    // The newest ones are the ones worth remembering: an id that falls out is a
    // replay the database dedupes, while forgetting a fresh one is a duplicate event.
    expect(parsed['NVDA.US'].ids).toEqual(expect.arrayContaining(['n9', 'n8', 'n7']));
  });

  it('re-offers a headline whose id fell out of the window rather than losing it', async () => {
    const older = news('old', '2026-08-20T10:00:00Z');
    const first = adapter([older, news('a', '2026-08-20T11:00:00Z')], { maxSeenIds: 1 });
    const round1 = await first.poll!({ cursor: null });
    expect(round1.drafts).toHaveLength(2);

    const second = adapter([older, news('a', '2026-08-20T11:00:00Z')], { maxSeenIds: 1 });
    const round2 = await second.poll!({ cursor: round1.cursor! });

    // Best effort without upstream paging: a replay is absorbed by the domain's
    // dedupe, whereas a local cursor that skipped it would lose it for good.
    expect(round2.drafts.map((d) => d.dedupeKey)).toEqual(['old']);
  });

  it('keeps one symbol out of another symbol id window', async () => {
    const instance = createLongbridgeNewsAdapter({
      getNews: async (symbol) =>
        symbol === 'NVDA.US'
          ? [news('n1', '2026-08-20T13:00:00Z')]
          : [news('m1', '2026-08-20T09:00:00Z')],
      symbols: async () => ['NVDA.US', 'MU.US'],
    });

    const { cursor } = await instance.poll!({ cursor: null });
    const parsed = JSON.parse(cursor!) as Record<string, { ids: string[] }>;
    expect(parsed['NVDA.US'].ids).toEqual(['n1']);
    expect(parsed['MU.US'].ids).toEqual(['m1']);
  });
});
