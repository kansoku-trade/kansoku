import { WEB_SEARCH_PROVIDERS } from '../../../contract/webSearch.js';
import { readSearchApiKey } from '../keys.js';
import {
  SearchAdapterError,
  type SearchAdapter,
  type SearchRequest,
  type SearchResponse,
  type SearchSource,
} from '../types.js';

const MAX_SOURCES = 6;
const SNIPPET_MAX_CHARS = 600;

type Json = Record<string, unknown>;

export interface HttpSearchSpec {
  id: string;
  label: string;
  envVar: string;
  signupUrl: string;
  request: (request: SearchRequest, apiKey: string) => { url: string; init: RequestInit };
  parse: (payload: Json) => { answer?: string; sources: SearchSource[] };
}

function asRecord(value: unknown): Json | null {
  return typeof value === 'object' && value !== null ? (value as Json) : null;
}

function text(value: unknown, max = SNIPPET_MAX_CHARS): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function toSources(values: unknown, map: (row: Json) => SearchSource | null): SearchSource[] {
  if (!Array.isArray(values)) return [];
  const sources: SearchSource[] = [];
  for (const value of values) {
    const row = asRecord(value);
    if (!row) continue;
    const source = map(row);
    if (source) sources.push(source);
  }
  return sources.slice(0, MAX_SOURCES);
}

function providerMeta(id: string): Pick<HttpSearchSpec, 'id' | 'label' | 'envVar' | 'signupUrl'> {
  const meta = WEB_SEARCH_PROVIDERS.find((provider) => provider.id === id);
  if (!meta) throw new Error(`webSearch: no provider metadata for ${id}`);
  return { id: meta.id, label: meta.label, envVar: meta.envVar, signupUrl: meta.signupUrl };
}

export function createHttpSearchAdapter(
  spec: HttpSearchSpec,
  fetchImpl: typeof fetch = fetch,
): SearchAdapter {
  return {
    id: spec.id,
    label: spec.label,
    async isAvailable() {
      return (await readSearchApiKey(spec.id, spec.envVar)) !== null;
    },
    async search(request: SearchRequest): Promise<SearchResponse> {
      const apiKey = await readSearchApiKey(spec.id, spec.envVar);
      if (!apiKey) {
        throw new SearchAdapterError(
          spec.id,
          `${spec.label} has no API key. Set ${spec.envVar} or add one in settings (${spec.signupUrl}).`,
        );
      }

      const timeout = AbortSignal.timeout(request.timeoutMs);
      const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
      const { url, init } = spec.request(request, apiKey);

      let response: Response;
      try {
        response = await fetchImpl(url, { ...init, signal });
      } catch (error) {
        throw new SearchAdapterError(
          spec.id,
          `${spec.label} request failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (!response.ok) {
        const body = (await response.text().catch(() => '')).slice(0, 300);
        throw new SearchAdapterError(
          spec.id,
          `${spec.label} returned HTTP ${response.status}${body ? `: ${body}` : ''}`,
        );
      }

      const payload = asRecord(await response.json().catch(() => null));
      if (!payload) throw new SearchAdapterError(spec.id, `${spec.label} returned invalid JSON.`);

      const parsed = spec.parse(payload);
      return { provider: spec.id, answer: parsed.answer, sources: parsed.sources };
    },
  };
}

const TAVILY_TIME_RANGE = { day: 'day', week: 'week', month: 'month', year: 'year' } as const;

export const tavilySpec: HttpSearchSpec = {
  ...providerMeta('tavily'),
  request: (request, apiKey) => ({
    url: 'https://api.tavily.com/search',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        query: request.query,
        search_depth: 'basic',
        max_results: MAX_SOURCES,
        include_answer: 'advanced',
        include_raw_content: false,
        ...(request.recency ? { time_range: TAVILY_TIME_RANGE[request.recency] } : {}),
      }),
    },
  }),
  parse: (payload) => ({
    answer: text(payload.answer, 4000),
    sources: toSources(payload.results, (row) => {
      const url = text(row.url, 2000);
      if (!url) return null;
      return {
        title: text(row.title, 300) ?? url,
        url,
        snippet: text(row.content),
        publishedDate: text(row.published_date, 100),
      };
    }),
  }),
};

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENCY_DAYS = { day: 1, week: 7, month: 30, year: 365 } as const;

export const exaSpec: HttpSearchSpec = {
  ...providerMeta('exa'),
  request: (request, apiKey) => ({
    url: 'https://api.exa.ai/search',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        query: request.query,
        numResults: MAX_SOURCES,
        type: 'auto',
        contents: { summary: { query: request.query } },
        ...(request.recency
          ? {
              startPublishedDate: new Date(
                Date.now() - RECENCY_DAYS[request.recency] * DAY_MS,
              ).toISOString(),
            }
          : {}),
      }),
    },
  }),
  parse: (payload) => ({
    sources: toSources(payload.results, (row) => {
      const url = text(row.url, 2000);
      if (!url) return null;
      return {
        title: text(row.title, 300) ?? url,
        url,
        snippet: text(row.summary) ?? text(row.text),
        publishedDate: text(row.publishedDate, 100),
      };
    }),
  }),
};

const BRAVE_FRESHNESS = { day: 'pd', week: 'pw', month: 'pm', year: 'py' } as const;

export const braveSpec: HttpSearchSpec = {
  ...providerMeta('brave'),
  request: (request, apiKey) => {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', request.query);
    url.searchParams.set('count', String(MAX_SOURCES));
    url.searchParams.set('extra_snippets', 'true');
    url.searchParams.set('text_decorations', 'false');
    if (request.recency) url.searchParams.set('freshness', BRAVE_FRESHNESS[request.recency]);
    return {
      url: url.toString(),
      init: { headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey } },
    };
  },
  parse: (payload) => ({
    sources: toSources(asRecord(payload.web)?.results, (row) => {
      const url = text(row.url, 2000);
      if (!url) return null;
      return {
        title: text(row.title, 300) ?? url,
        url,
        snippet: text(row.description),
        publishedDate: text(row.age, 100),
      };
    }),
  }),
};

export const HTTP_SEARCH_SPECS = [tavilySpec, exaSpec, braveSpec] as const;
