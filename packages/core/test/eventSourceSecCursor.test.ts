import { describe, expect, it, vi } from 'vitest';
import { createSecAdapter, edgarTickerOf } from '../src/events/sources/sec.js';

const USER_AGENT = 'Kansoku Test <dev@example.com>';

function tickerPayload(map: Record<string, number>): unknown {
  return Object.fromEntries(
    Object.entries(map).map(([ticker, cik], index) => [String(index), { cik_str: cik, ticker }]),
  );
}

function submissions(entries: Array<{ accession: string; form: string; accepted: string }>) {
  return {
    filings: {
      recent: {
        accessionNumber: entries.map((e) => e.accession),
        acceptanceDateTime: entries.map((e) => e.accepted),
        filingDate: entries.map((e) => e.accepted.slice(0, 10)),
        form: entries.map((e) => e.form),
        primaryDocument: entries.map(() => 'doc.htm'),
      },
    },
  };
}

interface Harness {
  fetch: typeof globalThis.fetch;
  calls: string[];
}

function harness(routes: Record<string, unknown>): Harness {
  const calls: string[] = [];
  const fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const payload = routes[url];
    if (payload === undefined) return new Response('missing', { status: 404 });
    return new Response(JSON.stringify(payload), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}

describe('EDGAR ticker mapping', () => {
  it('maps a class share to the dash form EDGAR uses', () => {
    expect(edgarTickerOf('BRK.B.US')).toBe('BRK-B');
    expect(edgarTickerOf('BF.B.US')).toBe('BF-B');
  });

  it('still maps a plain US ticker and still skips what EDGAR does not list', () => {
    expect(edgarTickerOf('NVDA.US')).toBe('NVDA');
    expect(edgarTickerOf('nvda')).toBe('NVDA');
    expect(edgarTickerOf('700.HK')).toBeNull();
    expect(edgarTickerOf('600519.SH')).toBeNull();
    expect(edgarTickerOf('.SOX.US')).toBeNull();
    expect(edgarTickerOf('   ')).toBeNull();
  });
});

describe('SEC cursor survives a restart', () => {
  const tickers = 'https://www.sec.gov/files/company_tickers.json';

  function routesFor(names: string[]): Record<string, unknown> {
    const map = Object.fromEntries(names.map((name, i) => [name, i + 1]));
    const routes: Record<string, unknown> = { [tickers]: tickerPayload(map) };
    for (const cik of Object.values(map)) {
      const padded = String(cik).padStart(10, '0');
      routes[`https://data.sec.gov/submissions/CIK${padded}.json`] = submissions([
        {
          accession: `0000000000-26-00000${cik}`,
          accepted: '2026-08-20T12:00:00.000Z',
          form: '8-K',
        },
      ]);
    }
    return routes;
  }

  function adapterFor(symbols: string[], names: string[], maxPerCycle: number) {
    const { calls, fetch } = harness(routesFor(names));
    return {
      calls,
      instance: createSecAdapter({
        fetch,
        maxSymbolsPerCycle: maxPerCycle,
        requestGapMs: 0,
        sleep: async () => {},
        symbols: async () => symbols,
        userAgent: USER_AGENT,
      }),
    };
  }

  it('records where the rotation stopped so a fresh process resumes there', async () => {
    const symbols = ['AAA.US', 'BBB.US', 'CCC.US', 'DDD.US'];
    const names = ['AAA', 'BBB', 'CCC', 'DDD'];

    const first = adapterFor(symbols, names, 2);
    const round1 = await first.instance.poll!({ cursor: null });
    expect(round1.drafts.map((d) => d.symbols[0])).toEqual(['AAA.US', 'BBB.US']);

    // A brand-new adapter, as after a restart: only the stored cursor can stop it
    // from reading the first two names again and never reaching the tail.
    const second = adapterFor(symbols, names, 2);
    const round2 = await second.instance.poll!({ cursor: round1.cursor! });
    expect(round2.drafts.map((d) => d.symbols[0])).toEqual(['CCC.US', 'DDD.US']);
  });

  it('keeps each symbol high-water mark next to the rotation', async () => {
    const symbols = ['AAA.US', 'BBB.US'];
    const first = adapterFor(symbols, ['AAA', 'BBB'], 1);
    const round1 = await first.instance.poll!({ cursor: null });
    const cursor = JSON.parse(round1.cursor!) as {
      rotation?: number;
      symbols?: Record<string, { at: string; ids: string[] }>;
    };

    expect(cursor.rotation).toBe(1);
    expect(cursor.symbols?.['AAA.US']?.ids).toEqual(['0000000000-26-000001']);

    // Second round moves on to BBB and must not forget AAA.
    const second = adapterFor(symbols, ['AAA', 'BBB'], 1);
    const round2 = await second.instance.poll!({ cursor: round1.cursor! });
    const merged = JSON.parse(round2.cursor!) as {
      rotation?: number;
      symbols?: Record<string, { ids: string[] }>;
    };
    expect(round2.drafts.map((d) => d.symbols[0])).toEqual(['BBB.US']);
    expect(Object.keys(merged.symbols ?? {}).sort()).toEqual(['AAA.US', 'BBB.US']);
    expect(merged.rotation).toBe(0);
  });

  it('does not replay a filing it already reported for a symbol', async () => {
    const first = adapterFor(['AAA.US'], ['AAA'], 5);
    const round1 = await first.instance.poll!({ cursor: null });
    expect(round1.drafts).toHaveLength(1);

    const second = adapterFor(['AAA.US'], ['AAA'], 5);
    const round2 = await second.instance.poll!({ cursor: round1.cursor! });
    expect(round2.drafts).toEqual([]);
  });

  it('starts over rather than failing when the stored cursor is unreadable', async () => {
    const { instance } = adapterFor(['AAA.US'], ['AAA'], 5);
    const result = await instance.poll!({ cursor: '{not json' });
    expect(result.drafts).toHaveLength(1);
  });

  it('looks up a class share under its EDGAR name', async () => {
    const { calls, instance } = adapterFor(['BRK.B.US'], ['BRK-B'], 5);
    const { drafts } = await instance.poll!({ cursor: null });

    expect(drafts).toHaveLength(1);
    expect(drafts[0].symbols).toEqual(['BRK.B.US']);
    expect(drafts[0].payload.title).toContain('BRK-B');
    expect(calls.some((url) => url.includes('CIK0000000001.json'))).toBe(true);
  });

  it('places a filing with no acceptance time at midday Eastern on its filing date', async () => {
    const { fetch } = harness({
      'https://www.sec.gov/files/company_tickers.json': tickerPayload({ AAA: 1 }),
      'https://data.sec.gov/submissions/CIK0000000001.json': submissions([
        { accession: '0000000000-26-000001', accepted: '2026-08-20', form: '8-K' },
      ]),
    });
    const instance = createSecAdapter({
      fetch,
      requestGapMs: 0,
      sleep: async () => {},
      symbols: async () => ['AAA.US'],
      userAgent: USER_AGENT,
    });

    const { drafts } = await instance.poll!({ cursor: null });
    expect(drafts[0].occurredAt).toBe('2026-08-20T16:00:00.000Z');
  });
});

describe('SEC adapter reads with a leash', () => {
  it('gives up on a request that never answers', async () => {
    const fetch = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof globalThis.fetch;

    const instance = createSecAdapter({
      fetch,
      requestGapMs: 0,
      sleep: async () => {},
      symbols: async () => ['AAA.US'],
      timeoutMs: 20,
      userAgent: USER_AGENT,
    });

    await expect(instance.poll!({ cursor: null })).rejects.toThrow();
  });

  it('refuses a response larger than the cap instead of buffering it', async () => {
    const huge = JSON.stringify(tickerPayload({ AAA: 1 })) + ' '.repeat(4096);
    const fetch = (async () =>
      new Response(huge, {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })) as typeof globalThis.fetch;

    const instance = createSecAdapter({
      fetch,
      maxBytes: 128,
      requestGapMs: 0,
      sleep: async () => {},
      symbols: async () => ['AAA.US'],
      userAgent: USER_AGENT,
    });

    await expect(instance.poll!({ cursor: null })).rejects.toThrow(/too large|cap|bytes/i);
  });

  it('stops early when the caller aborts the poll', async () => {
    const controller = new AbortController();
    const fetch = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted by caller')));
        }),
    ) as unknown as typeof globalThis.fetch;

    const instance = createSecAdapter({
      fetch,
      requestGapMs: 0,
      sleep: async () => {},
      symbols: async () => ['AAA.US'],
      userAgent: USER_AGENT,
    });

    const polling = instance.poll!({ cursor: null, signal: controller.signal });
    controller.abort();
    await expect(polling).rejects.toThrow();
  });
});
