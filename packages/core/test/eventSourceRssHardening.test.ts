import { describe, expect, it, vi } from 'vitest';
import {
  BLS_SOURCE,
  createBlsRssAdapter,
  createFedMonetaryAdapter,
  createFedPressAdapter,
  FED_MONETARY_SOURCE,
  FED_PRESS_SOURCE,
} from '../src/events/sources/macroRss.js';
import { parseFeed } from '../src/events/sources/rss.js';

function rss(items: string): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>feed</title>${items}</channel></rss>`;
}

const ONE_ITEM = rss(`
  <item>
    <title>FOMC statement</title>
    <guid>fomc-2026-09</guid>
    <link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20260917a.htm</link>
    <pubDate>Wed, 17 Sep 2026 18:00:00 GMT</pubDate>
  </item>
`);

function textResponse(body: string, init: { status?: number; type?: string } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers: new Headers({ 'content-type': init.type ?? 'application/rss+xml' }),
    text: async () => body,
  } as unknown as Response;
}

function fetchOf(bodies: Record<string, string | Error>): typeof globalThis.fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = bodies[url];
    if (body === undefined) throw new Error(`unexpected fetch: ${url}`);
    if (body instanceof Error) throw body;
    return textResponse(body);
  }) as unknown as typeof globalThis.fetch;
}

describe('Fed feeds are independent sources', () => {
  it('gives the monetary feed and the press feed their own source names', () => {
    const monetary = createFedMonetaryAdapter({ fetch: fetchOf({}) });
    const press = createFedPressAdapter({ fetch: fetchOf({}) });
    expect(monetary.source).toBe(FED_MONETARY_SOURCE);
    expect(press.source).toBe(FED_PRESS_SOURCE);
    expect(monetary.source).not.toBe(press.source);
  });

  it('fails the monetary source when its own feed is down, whatever the press feed does', async () => {
    const monetary = createFedMonetaryAdapter({
      fetch: vi.fn(async () => {
        throw new Error('federalreserve.gov timed out');
      }) as unknown as typeof globalThis.fetch,
    });

    await expect(monetary.poll!({ cursor: null })).rejects.toThrow(/timed out/);
  });

  it('reads its single feed and reports the statement', async () => {
    const monetary = createFedMonetaryAdapter({
      fetch: fetchOf({
        'https://www.federalreserve.gov/feeds/press_monetary.xml': ONE_ITEM,
      }),
    });

    const { drafts } = await monetary.poll!({ cursor: null });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ class: 'policy', dedupeKey: 'fomc-2026-09' });
  });
});

describe('a feed that is not a feed is a source failure', () => {
  const cases: Array<[string, string]> = [
    ['an HTML error page served with status 200', '<!doctype html><html><body>maintenance</body></html>'],
    ['an empty body', ''],
    ['whitespace only', '   \n  '],
    ['a truncated document', '<?xml version="1.0"?><rss version="2.0"><channel><item><title>half'],
  ];

  for (const [label, body] of cases) {
    it(`rejects ${label} instead of reporting zero events`, async () => {
      const monetary = createFedMonetaryAdapter({
        fetch: fetchOf({ 'https://www.federalreserve.gov/feeds/press_monetary.xml': body }),
      });
      await expect(monetary.poll!({ cursor: null })).rejects.toThrow(/feed/i);
    });

    it(`rejects ${label} on the BLS feed too`, async () => {
      const bls = createBlsRssAdapter({
        fetch: fetchOf({ 'https://www.bls.gov/feed/bls_latest.rss': body }),
      });
      expect(bls.source).toBe(BLS_SOURCE);
      await expect(bls.poll!({ cursor: null })).rejects.toThrow(/feed/i);
    });
  }

  it('accepts a well-formed feed that genuinely has no items', async () => {
    const bls = createBlsRssAdapter({
      fetch: fetchOf({ 'https://www.bls.gov/feed/bls_latest.rss': rss('') }),
    });
    const result = await bls.poll!({ cursor: null });
    expect(result.drafts).toEqual([]);
  });

  it('accepts an Atom document', async () => {
    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>note</title><id>urn:1</id><updated>2026-09-17T18:00:00Z</updated></entry>
    </feed>`;
    const bls = createBlsRssAdapter({
      fetch: fetchOf({ 'https://www.bls.gov/feed/bls_latest.rss': atom }),
    });
    const result = await bls.poll!({ cursor: null });
    expect(result.drafts).toHaveLength(1);
  });
});

describe('feed reads are leashed', () => {
  const base = 'https://www.federalreserve.gov/feeds/press_monetary.xml';

  it('gives up on a feed that never answers', async () => {
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof globalThis.fetch;

    const monetary = createFedMonetaryAdapter({ fetch: fetchImpl, timeoutMs: 20 });

    await expect(monetary.poll!({ cursor: null })).rejects.toThrow(/timed out|abort/i);
  });

  it('refuses a feed bigger than the cap', async () => {
    const monetary = createFedMonetaryAdapter({
      fetch: fetchOf({ [base]: rss('') + ' '.repeat(2048) }),
      maxBytes: 64,
    });

    await expect(monetary.poll!({ cursor: null })).rejects.toThrow(/too large|cap|bytes/i);
  });

  it('stops when the runtime aborts the poll', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn() as unknown as typeof globalThis.fetch;

    const monetary = createFedMonetaryAdapter({ fetch: fetchImpl });

    await expect(monetary.poll!({ cursor: null, signal: controller.signal })).rejects.toThrow(
      /abort/i,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('feed links are resolved against the feed URL', () => {
  const base = 'https://www.federalreserve.gov/feeds/press_monetary.xml';

  it('turns a root-relative link into an absolute one', () => {
    const items = parseFeed(
      rss(
        `<item><title>t</title><guid>g1</guid><link>/newsevents/pressreleases/a.htm</link><pubDate>Wed, 17 Sep 2026 18:00:00 GMT</pubDate></item>`,
      ),
      base,
    );
    expect(items[0].link).toBe('https://www.federalreserve.gov/newsevents/pressreleases/a.htm');
  });

  it('drops a link whose scheme is not http or https', () => {
    const items = parseFeed(
      rss(
        `<item><title>t</title><guid>g1</guid><link>javascript:alert(1)</link><pubDate>Wed, 17 Sep 2026 18:00:00 GMT</pubDate></item>`,
      ),
      base,
    );
    expect(items[0].link).toBeNull();
  });

  it('keeps an absolute https link as it is', () => {
    const items = parseFeed(
      rss(
        `<item><title>t</title><guid>g1</guid><link>https://www.bls.gov/news.release/cpi.htm</link><pubDate>Wed, 17 Sep 2026 18:00:00 GMT</pubDate></item>`,
      ),
      base,
    );
    expect(items[0].link).toBe('https://www.bls.gov/news.release/cpi.htm');
  });

  it('leaves a relative link alone when no feed URL is known', () => {
    const items = parseFeed(
      rss(
        `<item><title>t</title><guid>g1</guid><link>/a.htm</link><pubDate>Wed, 17 Sep 2026 18:00:00 GMT</pubDate></item>`,
      ),
    );
    expect(items[0].link).toBe('/a.htm');
  });
});
