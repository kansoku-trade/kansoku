import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDb, type Db } from '../src/db/index.js';
import { createEventRuntime } from '../src/events/runtime.js';
import { createSecAdapter, SEC_SOURCE, type SecAdapterDeps } from '../src/events/sources/sec.js';

const open: Db[] = [];

afterEach(() => {
  for (const instance of open.splice(0)) instance.$client.close();
});

function db(): Db {
  const instance = createDb(':memory:');
  open.push(instance);
  return instance;
}

const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';

function tickerPayload(): unknown {
  return {
    0: { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
    1: { cik_str: 1045810, ticker: 'NVDA', title: 'NVIDIA CORP' },
    2: { cik_str: 723125, ticker: 'MU', title: 'MICRON TECHNOLOGY INC' },
  };
}

interface FilingRow {
  accessionNumber: string;
  acceptanceDateTime?: string;
  filingDate: string;
  form: string;
  primaryDocument?: string;
}

function submissions(rows: FilingRow[], cik = '0000320193'): unknown {
  const column = <K extends keyof FilingRow>(key: K) => rows.map((row) => row[key] ?? '');
  return {
    cik,
    filings: {
      recent: {
        accessionNumber: column('accessionNumber'),
        acceptanceDateTime: column('acceptanceDateTime'),
        filingDate: column('filingDate'),
        form: column('form'),
        primaryDocument: column('primaryDocument'),
      },
    },
  };
}

function filing(overrides: Partial<FilingRow> = {}): FilingRow {
  return {
    accessionNumber: '0000320193-26-000075',
    acceptanceDateTime: '2026-08-20T16:30:12.000Z',
    filingDate: '2026-08-20',
    form: '8-K',
    primaryDocument: 'aapl-20260820.htm',
    ...overrides,
  };
}

interface Routes {
  [url: string]: unknown | Error;
}

function harness(
  routes: Routes,
  symbols: string[],
  extra: Partial<SecAdapterDeps> = {},
): {
  adapter: ReturnType<typeof createSecAdapter>;
  calls: string[];
  headers: HeadersInit[];
  sleeps: number[];
} {
  const calls: string[] = [];
  const headers: HeadersInit[] = [];
  const sleeps: number[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    headers.push(init?.headers ?? {});
    const route = routes[url];
    if (route === undefined) return new Response('not found', { status: 404 });
    if (route instanceof Error) throw route;
    return new Response(JSON.stringify(route), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    });
  }) as typeof globalThis.fetch;

  const adapter = createSecAdapter({
    fetch: fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    symbols: async () => symbols,
    userAgent: 'Kansoku Tests <dev@example.com>',
    ...extra,
  });
  return { adapter, calls, headers, sleeps };
}

function submissionsUrl(cik: string): string {
  return `https://data.sec.gov/submissions/CIK${cik}.json`;
}

describe('SEC EDGAR event adapter — identity gate', () => {
  it('registers disabled with a visible reason when SEC_USER_AGENT is absent', () => {
    const fetchImpl = vi.fn();
    const adapter = createSecAdapter({
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
      symbols: async () => ['AAPL.US'],
      userAgent: undefined,
    });

    expect(adapter.enabled).toBe(false);
    expect(adapter.disabledReason).toMatch(/SEC_USER_AGENT/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('treats a blank user agent as absent instead of inventing an identity', () => {
    const adapter = createSecAdapter({
      fetch: (() => {
        throw new Error('must not be called');
      }) as unknown as typeof globalThis.fetch,
      symbols: async () => ['AAPL.US'],
      userAgent: '   ',
    });

    expect(adapter.enabled).toBe(false);
  });

  it('refuses to contact SEC at all while disabled, even if poll is called directly', async () => {
    const fetchImpl = vi.fn();
    const adapter = createSecAdapter({
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
      symbols: async () => ['AAPL.US'],
      userAgent: null,
    });

    await expect(adapter.poll!({ cursor: null })).rejects.toThrow(/SEC_USER_AGENT/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('shows the disabled reason in source health once the runtime starts it', async () => {
    const instance = db();
    const adapter = createSecAdapter({
      fetch: (() => {
        throw new Error('must not be called');
      }) as unknown as typeof globalThis.fetch,
      symbols: async () => [],
      userAgent: null,
    });
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });

    await runtime.start();
    await runtime.stop();

    const [state] = await runtime.health();
    expect(state.source).toBe(SEC_SOURCE);
    expect(state.health).toBe('disabled');
    // Its own field, not lastError: being off for a missing credential is not the
    // same as having crashed.
    expect(state.disabledReason).toMatch(/SEC_USER_AGENT/);
    expect(state.lastError).toBeNull();
  });

  it('is enabled and polls on the 12s cadence once an identity is configured', () => {
    const { adapter } = harness({}, []);
    expect(adapter.source).toBe(SEC_SOURCE);
    expect(adapter.enabled).not.toBe(false);
    expect(adapter.intervalMs).toBe(12_000);
  });
});

describe('SEC EDGAR event adapter — filings', () => {
  it('maps a watched ticker to its CIK and files each recent filing by accession number', async () => {
    const { adapter, calls, headers } = harness(
      {
        [TICKERS_URL]: tickerPayload(),
        [submissionsUrl('0000320193')]: submissions([filing()]),
      },
      ['AAPL.US'],
    );

    const { drafts } = await adapter.poll!({ cursor: null });

    expect(calls).toEqual([TICKERS_URL, submissionsUrl('0000320193')]);
    for (const header of headers) {
      expect((header as Record<string, string>)['user-agent']).toBe(
        'Kansoku Tests <dev@example.com>',
      );
    }
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      class: 'filing',
      dedupeKey: '0000320193-26-000075',
      kind: '8-K',
      occurredAt: '2026-08-20T16:30:12.000Z',
      source: SEC_SOURCE,
      symbols: ['AAPL.US'],
      trust: 'official',
    });
    expect(drafts[0].payload.url).toBe(
      'https://www.sec.gov/Archives/edgar/data/320193/000032019326000075/aapl-20260820.htm',
    );
    expect(drafts[0].payload.data).toMatchObject({
      acceptanceDateTime: '2026-08-20T16:30:12.000Z',
      filingDate: '2026-08-20',
      form: '8-K',
      primaryDocument: 'aapl-20260820.htm',
    });
  });

  it('keeps the key forms and their amendments, and drops the rest', async () => {
    const kept = ['8-K', '10-K', '10-Q', '6-K', '20-F', 'S-1', 'SC 13D', 'SC 13G', '4'];
    const amendments = kept.map((form) => `${form}/A`);
    const rows = [...kept, ...amendments, 'CORRESP', '144', 'NT 10-K'].map((form, i) =>
      filing({ accessionNumber: `acc-${i}`, form }),
    );
    const { adapter } = harness(
      {
        [TICKERS_URL]: tickerPayload(),
        [submissionsUrl('0000320193')]: submissions(rows),
      },
      ['AAPL.US'],
    );

    const { drafts } = await adapter.poll!({ cursor: null });

    expect(drafts.map((d) => d.kind).sort()).toEqual([...kept, ...amendments].sort());
  });

  it('links the filing index when SEC reports no primary document', async () => {
    const { adapter } = harness(
      {
        [TICKERS_URL]: tickerPayload(),
        [submissionsUrl('0000320193')]: submissions([filing({ primaryDocument: '' })]),
      },
      ['AAPL.US'],
    );

    const { drafts } = await adapter.poll!({ cursor: null });

    expect(drafts[0].payload.url).toBe(
      'https://www.sec.gov/Archives/edgar/data/320193/000032019326000075/0000320193-26-000075-index.htm',
    );
  });

  it('falls back to the filing date when no acceptance timestamp is given', async () => {
    const { adapter } = harness(
      {
        [TICKERS_URL]: tickerPayload(),
        [submissionsUrl('0000320193')]: submissions([filing({ acceptanceDateTime: '' })]),
      },
      ['AAPL.US'],
    );

    const { drafts } = await adapter.poll!({ cursor: null });

    // Midday Eastern, not midnight UTC: SEC dates are US-market dates, and midnight
    // UTC on the 20th is the evening of the 19th in New York.
    expect(drafts[0].occurredAt).toBe('2026-08-20T16:00:00.000Z');
  });

  it('remembers how far each name was read, so a restart does not replay its filings', async () => {
    const routes: Routes = {
      [TICKERS_URL]: tickerPayload(),
      [submissionsUrl('0000320193')]: submissions([filing()]),
    };
    const first = harness(routes, ['AAPL.US']);
    const round1 = await first.adapter.poll!({ cursor: null });
    expect(round1.drafts).toHaveLength(1);

    const second = harness(
      {
        ...routes,
        [submissionsUrl('0000320193')]: submissions([
          filing(),
          filing({
            accessionNumber: '0000320193-26-000076',
            acceptanceDateTime: '2026-08-20T18:00:00.000Z',
            form: '10-Q',
          }),
        ]),
      },
      ['AAPL.US'],
    );
    const round2 = await second.adapter.poll!({ cursor: round1.cursor! });

    expect(round2.drafts.map((d) => d.dedupeKey)).toEqual(['0000320193-26-000076']);
  });

  it('still delivers a second filing accepted at the same instant as the last one seen', async () => {
    const routes: Routes = {
      [TICKERS_URL]: tickerPayload(),
      [submissionsUrl('0000320193')]: submissions([filing()]),
    };
    const first = harness(routes, ['AAPL.US']);
    const round1 = await first.adapter.poll!({ cursor: null });

    const second = harness(
      {
        ...routes,
        [submissionsUrl('0000320193')]: submissions([
          filing(),
          filing({ accessionNumber: '0000320193-26-000077', form: '10-Q' }),
        ]),
      },
      ['AAPL.US'],
    );
    const round2 = await second.adapter.poll!({ cursor: round1.cursor! });

    expect(round2.drafts.map((d) => d.dedupeKey)).toEqual(['0000320193-26-000077']);
  });

  it('starts over rather than throwing when the stored cursor is unreadable', async () => {
    const { adapter } = harness(
      {
        [TICKERS_URL]: tickerPayload(),
        [submissionsUrl('0000320193')]: submissions([filing()]),
      },
      ['AAPL.US'],
    );

    const { drafts } = await adapter.poll!({ cursor: '}{not json' });

    expect(drafts).toHaveLength(1);
  });

  it('reuses the cached ticker map across cycles instead of re-downloading it', async () => {
    const { adapter, calls } = harness(
      {
        [TICKERS_URL]: tickerPayload(),
        [submissionsUrl('0000320193')]: submissions([]),
      },
      ['AAPL.US'],
    );

    await adapter.poll!({ cursor: null });
    await adapter.poll!({ cursor: null });

    expect(calls.filter((url) => url === TICKERS_URL)).toHaveLength(1);
  });

  it('re-downloads the ticker map once its cache has expired', async () => {
    let now = 1_000_000;
    const { adapter, calls } = harness(
      {
        [TICKERS_URL]: tickerPayload(),
        [submissionsUrl('0000320193')]: submissions([]),
      },
      ['AAPL.US'],
      { now: () => now, tickerCacheTtlMs: 60_000 },
    );

    await adapter.poll!({ cursor: null });
    now += 60_001;
    await adapter.poll!({ cursor: null });

    expect(calls.filter((url) => url === TICKERS_URL)).toHaveLength(2);
  });

  it('skips a watched symbol EDGAR has no CIK for, without failing the cycle', async () => {
    const { adapter, calls } = harness(
      {
        [TICKERS_URL]: tickerPayload(),
        [submissionsUrl('0000320193')]: submissions([filing()]),
      },
      ['AAPL.US', '.SOX.US', '700.HK'],
    );

    const { drafts } = await adapter.poll!({ cursor: null });

    expect(calls).toEqual([TICKERS_URL, submissionsUrl('0000320193')]);
    expect(drafts).toHaveLength(1);
  });

  it('requests one name at a time with a gap, to stay inside the SEC rate limit', async () => {
    const { adapter, calls, sleeps } = harness(
      {
        [TICKERS_URL]: tickerPayload(),
        [submissionsUrl('0000320193')]: submissions([]),
        [submissionsUrl('0001045810')]: submissions([], '0001045810'),
      },
      ['AAPL.US', 'NVDA.US'],
    );

    await adapter.poll!({ cursor: null });

    expect(calls).toEqual([
      TICKERS_URL,
      submissionsUrl('0000320193'),
      submissionsUrl('0001045810'),
    ]);
    expect(sleeps.length).toBeGreaterThanOrEqual(calls.length - 1);
    for (const gap of sleeps) expect(gap).toBeGreaterThanOrEqual(100);
  });

  it('spreads a watch list wider than one cycle across consecutive cycles', async () => {
    const { adapter, calls } = harness(
      {
        [TICKERS_URL]: tickerPayload(),
        [submissionsUrl('0000320193')]: submissions([]),
        [submissionsUrl('0000723125')]: submissions([], '0000723125'),
        [submissionsUrl('0001045810')]: submissions([], '0001045810'),
      },
      ['AAPL.US', 'NVDA.US', 'MU.US'],
      { maxSymbolsPerCycle: 2 },
    );

    await adapter.poll!({ cursor: null });
    const firstCycle = calls.filter((url) => url.includes('/submissions/'));
    calls.length = 0;
    await adapter.poll!({ cursor: null });
    const secondCycle = calls.filter((url) => url.includes('/submissions/'));

    expect(firstCycle).toEqual([submissionsUrl('0000320193'), submissionsUrl('0001045810')]);
    expect(secondCycle).toEqual([submissionsUrl('0000723125'), submissionsUrl('0000320193')]);
  });

  it('keeps the names that answered when one name errors out', async () => {
    const { adapter } = harness(
      {
        [TICKERS_URL]: tickerPayload(),
        [submissionsUrl('0000320193')]: new Error('connection reset'),
        [submissionsUrl('0001045810')]: submissions(
          [filing({ accessionNumber: 'nvda-1' })],
          '0001045810',
        ),
      },
      ['AAPL.US', 'NVDA.US'],
    );

    const { drafts } = await adapter.poll!({ cursor: null });

    expect(drafts.map((d) => d.dedupeKey)).toEqual(['nvda-1']);
  });

  it('fails the cycle when SEC answers every name with an error', async () => {
    const { adapter } = harness(
      {
        [TICKERS_URL]: tickerPayload(),
        [submissionsUrl('0000320193')]: new Error('connection reset'),
      },
      ['AAPL.US'],
    );

    await expect(adapter.poll!({ cursor: null })).rejects.toThrow(/sec/i);
  });

  it('fails the cycle on a rate-limit response rather than reporting a quiet source', async () => {
    const fetchImpl = (async () =>
      new Response('too many requests', { status: 429 })) as typeof globalThis.fetch;
    const adapter = createSecAdapter({
      fetch: fetchImpl,
      sleep: async () => {},
      symbols: async () => ['AAPL.US'],
      userAgent: 'Kansoku Tests <dev@example.com>',
    });

    await expect(adapter.poll!({ cursor: null })).rejects.toThrow(/429/);
  });

  it('reports nothing and asks SEC nothing when there is no watch list', async () => {
    const { adapter, calls } = harness({ [TICKERS_URL]: tickerPayload() }, []);

    const result = await adapter.poll!({ cursor: null });

    expect(calls).toEqual([]);
    expect(result.drafts).toEqual([]);
  });
});
