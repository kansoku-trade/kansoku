import { describe, expect, it } from 'vitest';
import { buildPrompt, createCliAgentAdapter } from '../src/ai/websearch/adapters/cliAgent.js';
import { formatForLlm } from '../src/ai/websearch/format.js';
import {
  braveSpec,
  createHttpSearchAdapter,
  exaSpec,
  tavilySpec,
} from '../src/ai/websearch/adapters/httpSearch.js';
import { adapterOrder, DEFAULT_ADAPTER_ORDER, runWebSearch } from '../src/ai/websearch/registry.js';
import type { SearchAdapter } from '../src/ai/websearch/types.js';

function stubAdapter(id: string, behavior: Partial<SearchAdapter> = {}): SearchAdapter {
  return {
    id,
    label: id,
    isAvailable: async () => true,
    search: async () => ({ provider: id, answer: `answer from ${id}`, sources: [] }),
    ...behavior,
  };
}

describe('runWebSearch', () => {
  it('returns the first available adapter answer', async () => {
    const text = await runWebSearch({
      query: 'q',
      adapters: [stubAdapter('a'), stubAdapter('b')],
    });
    expect(text).toContain('answer from a');
    expect(text).toContain('(via a)');
  });

  it('skips unavailable adapters without calling them', async () => {
    let called = false;
    const missing = stubAdapter('missing', {
      isAvailable: async () => false,
      search: async () => {
        called = true;
        throw new Error('should not run');
      },
    });
    const text = await runWebSearch({ query: 'q', adapters: [missing, stubAdapter('b')] });
    expect(called).toBe(false);
    expect(text).toContain('answer from b');
  });

  it('falls through to the next adapter when one fails', async () => {
    const failing = stubAdapter('a', {
      search: async () => {
        throw new Error('boom');
      },
    });
    const text = await runWebSearch({ query: 'q', adapters: [failing, stubAdapter('b')] });
    expect(text).toContain('answer from b');
  });

  it('reports every failure when all adapters fail', async () => {
    const fail = (id: string) =>
      stubAdapter(id, {
        search: async () => {
          throw new Error(`${id} down`);
        },
      });
    await expect(runWebSearch({ query: 'q', adapters: [fail('a'), fail('b')] })).rejects.toThrow(
      /a down; b down/,
    );
  });

  it('treats an empty answer as a failure so the next adapter runs', async () => {
    const empty = stubAdapter('a', {
      search: async () => ({ provider: 'a', answer: '   ', sources: [] }),
    });
    const text = await runWebSearch({ query: 'q', adapters: [empty, stubAdapter('b')] });
    expect(text).toContain('answer from b');
  });

  it('says nothing is installed when no adapter is available', async () => {
    const missing = stubAdapter('codex', { isAvailable: async () => false });
    await expect(runWebSearch({ query: 'q', adapters: [missing] })).rejects.toThrow(
      /No web search backend is available/,
    );
  });
});

describe('adapterOrder', () => {
  it('defaults to the keyed backends before codex once codex is opted in', () => {
    expect(adapterOrder({}, true)).toEqual(['tavily', 'exa', 'brave', 'codex']);
  });

  it('leaves codex out until the user opts in', () => {
    expect(adapterOrder({}, false)).toEqual(['tavily', 'exa', 'brave']);
    expect(adapterOrder({ KANSOKU_WEB_SEARCH_PROVIDERS: 'codex,brave' }, false)).toEqual(['brave']);
  });

  it('drops unknown ids from KANSOKU_WEB_SEARCH_PROVIDERS', () => {
    expect(adapterOrder({ KANSOKU_WEB_SEARCH_PROVIDERS: ' brave , nope ,codex' }, true)).toEqual([
      'brave',
      'codex',
    ]);
  });

  it('falls back to the default when the override names nothing valid', () => {
    expect(adapterOrder({ KANSOKU_WEB_SEARCH_PROVIDERS: 'nope' }, true)).toEqual([
      'tavily',
      'exa',
      'brave',
      'codex',
    ]);
  });
});

describe('buildPrompt', () => {
  it('adds a time window only when recency is set', () => {
    expect(buildPrompt({ query: 'MU', timeoutMs: 1 })).not.toMatch(/last \d/);
    expect(buildPrompt({ query: 'MU', recency: 'week', timeoutMs: 1 })).toContain('last 7 days');
  });

  it('keeps the query last so the preamble cannot be skipped', () => {
    expect(buildPrompt({ query: 'MU 财报', timeoutMs: 1 }).endsWith('Request:\nMU 财报')).toBe(
      true,
    );
  });
});

describe('createCliAgentAdapter', () => {
  const spec = {
    id: 'fake',
    label: 'Fake CLI',
    bin: 'fake-bin',
    versionArgs: ['--version'],
    searchArgs: (prompt: string) => ['run', prompt],
    readAnswer: async (stdout: string) => stdout.trim(),
  };

  it('probes the binary once and caches the answer', async () => {
    let probes = 0;
    const adapter = createCliAgentAdapter(spec, async (_bin, args) => {
      if (args[0] === '--version') probes++;
      return { stdout: 'ok' };
    });
    expect(await adapter.isAvailable()).toBe(true);
    expect(await adapter.isAvailable()).toBe(true);
    expect(probes).toBe(1);
  });

  it('reports unavailable when the binary is missing, and re-probes after an install', async () => {
    let installed = false;
    const adapter = createCliAgentAdapter(spec, async () => {
      if (!installed) throw new Error('spawn fake-bin ENOENT');
      return { stdout: 'ok' };
    });
    expect(await adapter.isAvailable()).toBe(false);
    installed = true;
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('wraps a search failure in a labelled adapter error', async () => {
    const adapter = createCliAgentAdapter(spec, async (_bin, args) => {
      if (args[0] === '--version') return { stdout: 'ok' };
      throw new Error('timed out');
    });
    await expect(adapter.search({ query: 'q', timeoutMs: 10 })).rejects.toThrow(
      /Fake CLI failed: timed out/,
    );
  });
});

describe('formatForLlm', () => {
  it('numbers sources and marks the provider', () => {
    const text = formatForLlm({
      provider: 'codex',
      answer: '结论',
      sources: [{ title: 'TSMC', url: 'https://x.test', publishedDate: '2026-09-05' }],
    });
    expect(text).toContain('[1] TSMC (2026-09-05)');
    expect(text).toContain('https://x.test');
    expect(text).toContain('(via codex)');
  });

  it('warns that a source-only response is not a written answer', () => {
    const text = formatForLlm({
      provider: 'brave',
      sources: [{ title: 'B', url: 'https://b.test' }],
    });
    expect(text).toContain('raw search hits');
  });

  it('omits the sources block when there are none', () => {
    expect(formatForLlm({ provider: 'claude', answer: '结论', sources: [] })).not.toContain(
      '## Sources',
    );
  });
});

describe('http search adapters', () => {
  const stubFetch = (
    payload: unknown,
    init: { ok?: boolean; status?: number; body?: string } = {},
  ) => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const impl = (async (url: string | URL, requestInit: RequestInit) => {
      calls.push({ url: String(url), init: requestInit });
      return {
        ok: init.ok ?? true,
        status: init.status ?? 200,
        json: async () => payload,
        text: async () => init.body ?? '',
      } as Response;
    }) as unknown as typeof fetch;
    return { impl, calls };
  };

  const withKey = async <T>(envVar: string, run: () => Promise<T>): Promise<T> => {
    const previous = process.env[envVar];
    process.env[envVar] = 'test-key';
    try {
      return await run();
    } finally {
      if (previous === undefined) delete process.env[envVar];
      else process.env[envVar] = previous;
    }
  };

  it('tavily maps answer, sources and the recency window', async () => {
    const { impl, calls } = stubFetch({
      answer: '结论',
      results: [
        { title: 'TSMC', url: 'https://a.test', content: '内容', published_date: '2026-09-01' },
        { title: 'no url' },
      ],
    });
    const adapter = createHttpSearchAdapter(tavilySpec, impl);
    const response = await withKey('TAVILY_API_KEY', () =>
      adapter.search({ query: 'TSM', recency: 'week', timeoutMs: 5000 }),
    );
    expect(response.answer).toBe('结论');
    expect(response.sources).toEqual([
      { title: 'TSMC', url: 'https://a.test', snippet: '内容', publishedDate: '2026-09-01' },
    ]);
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ time_range: 'week' });
  });

  it('tavily omits time_range when no recency is given', async () => {
    const { impl, calls } = stubFetch({ answer: 'x', results: [] });
    const adapter = createHttpSearchAdapter(tavilySpec, impl);
    await withKey('TAVILY_API_KEY', () => adapter.search({ query: 'TSM', timeoutMs: 5000 }));
    expect(JSON.parse(String(calls[0].init.body))).not.toHaveProperty('time_range');
  });

  it('brave reads web.results and maps recency to freshness', async () => {
    const { impl, calls } = stubFetch({
      web: {
        results: [{ title: 'B', url: 'https://b.test', description: 'd', age: '2 days ago' }],
      },
    });
    const adapter = createHttpSearchAdapter(braveSpec, impl);
    const response = await withKey('BRAVE_API_KEY', () =>
      adapter.search({ query: 'MU', recency: 'day', timeoutMs: 5000 }),
    );
    expect(response.sources[0]).toEqual({
      title: 'B',
      url: 'https://b.test',
      snippet: 'd',
      publishedDate: '2 days ago',
    });
    expect(calls[0].url).toContain('freshness=pd');
  });

  it('exa sends a startPublishedDate derived from recency', async () => {
    const { impl, calls } = stubFetch({
      results: [{ title: 'E', url: 'https://e.test', summary: 's', publishedDate: '2026-09-02' }],
    });
    const adapter = createHttpSearchAdapter(exaSpec, impl);
    const response = await withKey('EXA_API_KEY', () =>
      adapter.search({ query: 'AI', recency: 'month', timeoutMs: 5000 }),
    );
    expect(response.sources[0].url).toBe('https://e.test');
    const body = JSON.parse(String(calls[0].init.body));
    const days = (Date.now() - Date.parse(body.startPublishedDate)) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });

  it('reports unavailable and refuses to search without a key', async () => {
    const { impl } = stubFetch({});
    const adapter = createHttpSearchAdapter(tavilySpec, impl);
    const previous = process.env.TAVILY_API_KEY;
    delete process.env.TAVILY_API_KEY;
    try {
      expect(await adapter.isAvailable()).toBe(false);
      await expect(adapter.search({ query: 'q', timeoutMs: 5000 })).rejects.toThrow(
        /Tavily has no API key/,
      );
    } finally {
      if (previous !== undefined) process.env.TAVILY_API_KEY = previous;
    }
  });

  it('surfaces an HTTP error with its status and body', async () => {
    const { impl } = stubFetch(null, { ok: false, status: 401, body: 'bad key' });
    const adapter = createHttpSearchAdapter(tavilySpec, impl);
    await expect(
      withKey('TAVILY_API_KEY', () => adapter.search({ query: 'q', timeoutMs: 5000 })),
    ).rejects.toThrow(/Tavily returned HTTP 401: bad key/);
  });

  it('treats a keyless backend as skippable so the chain reaches codex', async () => {
    expect(DEFAULT_ADAPTER_ORDER).toEqual(['tavily', 'exa', 'brave', 'codex']);
  });
});
