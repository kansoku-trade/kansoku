import { describe, expect, it } from 'vitest';
import {
  BLS_LATEST_FEED,
  BLS_SOURCE,
  createBlsRssAdapter,
  createFedMonetaryAdapter,
  createFedPressAdapter,
  FED_ALL_PRESS_FEED,
  FED_MONETARY_FEED,
  FED_MONETARY_SOURCE,
  FED_PRESS_SOURCE,
} from '../src/events/sources/macroRss.js';
import { decodeXmlEntities, parseFeed } from '../src/events/sources/rss.js';

function rss(items: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Board of Governors</title>${items}</channel></rss>`;
}

function atom(entries: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>BLS</title>${entries}</feed>`;
}

describe('XML entity decoding', () => {
  it('decodes the named entities a feed actually uses', () => {
    expect(
      decodeXmlEntities('Fed &amp; Treasury &lt;joint&gt; &quot;note&quot; &apos;x&apos;'),
    ).toBe(`Fed & Treasury <joint> "note" 'x'`);
  });

  it('decodes decimal and hexadecimal character references', () => {
    expect(decodeXmlEntities('Powell&#39;s remarks &#x2014; live')).toBe("Powell's remarks — live");
  });

  it('leaves an unknown entity alone rather than dropping the text', () => {
    expect(decodeXmlEntities('100 &euro; &notanentity;')).toBe('100 &euro; &notanentity;');
  });

  it('decodes a double-escaped ampersand exactly once', () => {
    expect(decodeXmlEntities('a &amp;amp; b')).toBe('a &amp; b');
  });
});

describe('RSS/Atom parsing', () => {
  it('reads an RSS item into title, link, id and date', () => {
    const items = parseFeed(
      rss(`<item>
        <title>Federal Reserve issues FOMC statement</title>
        <link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20260820a.htm</link>
        <guid isPermaLink="false">monetary20260820a</guid>
        <pubDate>Wed, 20 Aug 2026 14:00:00 GMT</pubDate>
      </item>`),
    );

    expect(items).toEqual([
      {
        id: 'monetary20260820a',
        link: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260820a.htm',
        publishedAt: '2026-08-20T14:00:00.000Z',
        // The feed's own wording is kept beside the normalized instant: a later
        // dispute about "when" is settled on what the source actually wrote.
        rawPublishedAt: 'Wed, 20 Aug 2026 14:00:00 GMT',
        title: 'Federal Reserve issues FOMC statement',
      },
    ]);
  });

  it('reads an Atom entry, preferring the alternate link', () => {
    const items = parseFeed(
      atom(`<entry>
        <title>Consumer Price Index &#8212; July 2026</title>
        <id>tag:bls.gov,2026:cpi-202607</id>
        <link rel="self" href="https://www.bls.gov/feed/self" />
        <link rel="alternate" href="https://www.bls.gov/news.release/cpi.htm" />
        <updated>2026-08-12T12:30:00Z</updated>
      </entry>`),
    );

    expect(items).toEqual([
      {
        id: 'tag:bls.gov,2026:cpi-202607',
        link: 'https://www.bls.gov/news.release/cpi.htm',
        publishedAt: '2026-08-12T12:30:00.000Z',
        rawPublishedAt: '2026-08-12T12:30:00Z',
        title: 'Consumer Price Index — July 2026',
      },
    ]);
  });

  it('unwraps CDATA and decodes entities in the title', () => {
    const items = parseFeed(
      rss(`<item>
        <title><![CDATA[Fed &amp; FDIC joint statement]]></title>
        <link>https://example.gov/a</link>
        <guid>a</guid>
        <pubDate>Wed, 20 Aug 2026 14:00:00 GMT</pubDate>
      </item>`),
    );

    expect(items[0].title).toBe('Fed & FDIC joint statement');
  });

  it('keeps the order the feed published in', () => {
    const items = parseFeed(
      rss(
        ['a', 'b', 'c']
          .map(
            (id) =>
              `<item><title>${id}</title><link>https://example.gov/${id}</link><guid>${id}</guid><pubDate>Wed, 20 Aug 2026 14:00:00 GMT</pubDate></item>`,
          )
          .join(''),
      ),
    );

    expect(items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('falls back to the link as identity when the feed omits guid', () => {
    const items = parseFeed(
      rss(
        `<item><title>t</title><link>https://example.gov/only-link</link><pubDate>Wed, 20 Aug 2026 14:00:00 GMT</pubDate></item>`,
      ),
    );

    expect(items[0].id).toBeNull();
    expect(items[0].link).toBe('https://example.gov/only-link');
  });

  it('reports no date rather than guessing when the feed omits one', () => {
    const items = parseFeed(rss(`<item><title>t</title><guid>g</guid></item>`));
    expect(items[0].publishedAt).toBeNull();
  });

  it('accepts dc:date as the RSS 1.0 date', () => {
    const items = parseFeed(
      rss(`<item><title>t</title><guid>g</guid><dc:date>2026-08-20T14:00:00Z</dc:date></item>`),
    );
    expect(items[0].publishedAt).toBe('2026-08-20T14:00:00.000Z');
  });

  it('returns nothing for content that is not a feed, instead of throwing', () => {
    expect(parseFeed('<html><body>503 Service Unavailable</body></html>')).toEqual([]);
    expect(parseFeed('')).toEqual([]);
    expect(parseFeed('<rss><channel><item><title>unclosed')).toEqual([]);
  });
});

interface Routes {
  [url: string]: string | Error | number;
}

function fetcher(routes: Routes): { fetch: typeof globalThis.fetch; calls: string[] } {
  const calls: string[] = [];
  const fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const route = routes[url];
    if (route === undefined) return new Response('missing', { status: 404 });
    if (route instanceof Error) throw route;
    if (typeof route === 'number') return new Response('error', { status: route });
    return new Response(route, { status: 200 });
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}

const FOMC_ITEM = `<item>
  <title>Federal Reserve issues FOMC statement</title>
  <link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20260820a.htm</link>
  <guid isPermaLink="false">monetary20260820a</guid>
  <pubDate>Wed, 20 Aug 2026 14:00:00 GMT</pubDate>
</item>`;

describe('Fed monetary RSS adapter', () => {
  it('reads only the official monetary feed', async () => {
    const { calls, fetch } = fetcher({ [FED_MONETARY_FEED]: rss(FOMC_ITEM) });
    const adapter = createFedMonetaryAdapter({ fetch });

    await adapter.poll!({ cursor: null });

    expect(adapter.source).toBe(FED_MONETARY_SOURCE);
    expect(adapter.intervalMs).toBeGreaterThan(0);
    expect(calls).toEqual([FED_MONETARY_FEED]);
    expect(FED_MONETARY_FEED.startsWith('https://www.federalreserve.gov/')).toBe(true);
  });

  it('files a policy release with no symbol, keeping the official URL and date', async () => {
    const { fetch } = fetcher({ [FED_MONETARY_FEED]: rss(FOMC_ITEM) });

    const { drafts } = await createFedMonetaryAdapter({ fetch }).poll!({ cursor: null });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      class: 'policy',
      occurredAt: '2026-08-20T14:00:00.000Z',
      source: FED_MONETARY_SOURCE,
      symbols: [],
      trust: 'official',
    });
    expect(drafts[0].dedupeKey).toContain('monetary20260820a');
    expect(drafts[0].payload.title).toBe('Federal Reserve issues FOMC statement');
    expect(drafts[0].payload.url).toBe(
      'https://www.federalreserve.gov/newsevents/pressreleases/monetary20260820a.htm',
    );
    expect(drafts[0].payload.data).toMatchObject({
      feed: FED_MONETARY_FEED,
      publishedAt: 'Wed, 20 Aug 2026 14:00:00 GMT',
    });
  });

  it('treats an error status as this source failing', async () => {
    const { fetch } = fetcher({ [FED_MONETARY_FEED]: 503 });

    await expect(createFedMonetaryAdapter({ fetch }).poll!({ cursor: null })).rejects.toThrow(/503/);
  });

  it('drops an undated release instead of dating it now', async () => {
    const { fetch } = fetcher({
      [FED_MONETARY_FEED]: rss(
        `<item><title>t</title><link>https://example.gov/a</link><guid>a</guid></item>`,
      ),
    });

    const { drafts } = await createFedMonetaryAdapter({ fetch }).poll!({ cursor: null });

    expect(drafts).toEqual([]);
  });

  it('drops an item with neither guid nor link, since it has no stable identity', async () => {
    const { fetch } = fetcher({
      [FED_MONETARY_FEED]: rss(
        `<item><title>t</title><pubDate>Wed, 20 Aug 2026 14:00:00 GMT</pubDate></item>`,
      ),
    });

    const { drafts } = await createFedMonetaryAdapter({ fetch }).poll!({ cursor: null });

    expect(drafts).toEqual([]);
  });

  it('does not replay a release after a restart, but does deliver a newer one', async () => {
    const round1 = await createFedMonetaryAdapter({
      fetch: fetcher({ [FED_MONETARY_FEED]: rss(FOMC_ITEM) }).fetch,
    }).poll!({ cursor: null });
    expect(round1.drafts).toHaveLength(1);

    const newer = `<item><title>Fed announces new facility</title><link>https://example.gov/b</link><guid>b</guid><pubDate>Thu, 21 Aug 2026 14:00:00 GMT</pubDate></item>`;
    const round2 = await createFedMonetaryAdapter({
      fetch: fetcher({ [FED_MONETARY_FEED]: rss(FOMC_ITEM + newer) }).fetch,
    }).poll!({ cursor: round1.cursor! });

    expect(round2.drafts.map((d) => d.payload.title)).toEqual(['Fed announces new facility']);
  });

  it('starts over rather than throwing when the stored cursor is unreadable', async () => {
    const { fetch } = fetcher({ [FED_MONETARY_FEED]: rss(FOMC_ITEM) });

    const { drafts } = await createFedMonetaryAdapter({ fetch }).poll!({ cursor: 'nonsense' });

    expect(drafts).toHaveLength(1);
  });
});

describe('Fed all-press RSS adapter', () => {
  const OTHER_ITEM = `<item><title>Fed publishes annual report</title><link>https://www.federalreserve.gov/newsevents/pressreleases/other20260820a.htm</link><guid>other20260820a</guid><pubDate>Wed, 20 Aug 2026 14:00:00 GMT</pubDate></item>`;

  it('reads only the all-press feed, under its own source name', async () => {
    const { calls, fetch } = fetcher({ [FED_ALL_PRESS_FEED]: rss(OTHER_ITEM) });
    const adapter = createFedPressAdapter({ fetch });

    const { drafts } = await adapter.poll!({ cursor: null });

    expect(adapter.source).toBe(FED_PRESS_SOURCE);
    expect(calls).toEqual([FED_ALL_PRESS_FEED]);
    expect(drafts[0]).toMatchObject({ class: 'policy', source: FED_PRESS_SOURCE });
  });

  it('leaves the monetary releases to the monetary source instead of duplicating them', async () => {
    const { fetch } = fetcher({ [FED_ALL_PRESS_FEED]: rss(FOMC_ITEM + OTHER_ITEM) });

    const { drafts } = await createFedPressAdapter({ fetch }).poll!({ cursor: null });

    // Both Fed feeds carry an FOMC statement, and the timeline dedupes per source:
    // without this the same statement would land twice.
    expect(drafts.map((d) => d.dedupeKey)).toEqual(['other20260820a']);
  });

  it('degrades by itself when its feed is down, leaving the monetary source alone', async () => {
    const press = createFedPressAdapter({
      fetch: fetcher({ [FED_ALL_PRESS_FEED]: new Error('dns failure') }).fetch,
    });
    const monetary = createFedMonetaryAdapter({
      fetch: fetcher({ [FED_MONETARY_FEED]: rss(FOMC_ITEM) }).fetch,
    });

    await expect(press.poll!({ cursor: null })).rejects.toThrow(/dns failure/);
    await expect(monetary.poll!({ cursor: null })).resolves.toMatchObject({
      drafts: [expect.anything()],
    });
  });
});

describe('BLS latest RSS adapter', () => {
  it('reads the official BLS feed and files releases as macro events', async () => {
    const { calls, fetch } = fetcher({
      [BLS_LATEST_FEED]: atom(`<entry>
        <title>Consumer Price Index &#8212; July 2026</title>
        <id>tag:bls.gov,2026:cpi-202607</id>
        <link rel="alternate" href="https://www.bls.gov/news.release/cpi.htm" />
        <updated>2026-08-12T12:30:00Z</updated>
      </entry>`),
    });
    const adapter = createBlsRssAdapter({ fetch });

    const { drafts } = await adapter.poll!({ cursor: null });

    expect(adapter.source).toBe(BLS_SOURCE);
    expect(calls).toEqual([BLS_LATEST_FEED]);
    expect(BLS_LATEST_FEED.startsWith('https://www.bls.gov/')).toBe(true);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      class: 'macro',
      occurredAt: '2026-08-12T12:30:00.000Z',
      source: BLS_SOURCE,
      symbols: [],
      trust: 'official',
    });
    expect(drafts[0].payload.url).toBe('https://www.bls.gov/news.release/cpi.htm');
  });

  it('degrades on its own when BLS is down, telling the caller which feed failed', async () => {
    const { fetch } = fetcher({ [BLS_LATEST_FEED]: new Error('timeout') });

    await expect(createBlsRssAdapter({ fetch }).poll!({ cursor: null })).rejects.toThrow(
      /bls\.gov/,
    );
  });
});
