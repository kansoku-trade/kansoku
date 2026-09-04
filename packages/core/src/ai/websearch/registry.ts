import { codexAdapterSpec, createCliAgentAdapter } from './adapters/cliAgent.js';
import { isCodexSearchEnabled } from './codexOptIn.js';
import {
  braveSpec,
  createHttpSearchAdapter,
  exaSpec,
  HTTP_SEARCH_SPECS,
  tavilySpec,
} from './adapters/httpSearch.js';
import { formatForLlm } from './format.js';
import { readSearchApiKey } from './keys.js';
import {
  hasRenderableContent,
  SearchAdapterError,
  type SearchAdapter,
  type SearchRecency,
} from './types.js';

export const DEFAULT_TIMEOUT_MS = 150_000;
export const MAX_TIMEOUT_MS = 300_000;

const ADAPTER_FACTORIES: Record<string, () => SearchAdapter> = {
  tavily: () => createHttpSearchAdapter(tavilySpec),
  exa: () => createHttpSearchAdapter(exaSpec),
  brave: () => createHttpSearchAdapter(braveSpec),
  codex: () => createCliAgentAdapter(codexAdapterSpec),
};

// Keyed HTTP backends come first: they answer in seconds with machine-readable sources, where the
// codex CLI takes tens of seconds and returns prose whose citations cannot be checked structurally.
export const DEFAULT_ADAPTER_ORDER = ['tavily', 'exa', 'brave', 'codex'] as const;

export const WEB_SEARCH_KEY_PROVIDERS: ReadonlySet<string> = new Set(
  HTTP_SEARCH_SPECS.map((spec) => spec.id),
);

const instances = new Map<string, SearchAdapter>();

export function resetWebSearchAdaptersForTests(): void {
  instances.clear();
}

function getAdapter(id: string): SearchAdapter | null {
  const cached = instances.get(id);
  if (cached) return cached;
  const factory = ADAPTER_FACTORIES[id];
  if (!factory) return null;
  const adapter = factory();
  instances.set(id, adapter);
  return adapter;
}

// The codex CLI is opt-in: it is slow, returns prose without machine-readable sources, and spends
// the user's own ChatGPT quota, so it only joins the chain when the user turns it on in settings.
export function adapterOrder(
  env: NodeJS.ProcessEnv = process.env,
  codexEnabled: boolean = isCodexSearchEnabled(),
): string[] {
  const configured = env.KANSOKU_WEB_SEARCH_PROVIDERS?.split(',')
    .map((id) => id.trim())
    .filter((id) => id in ADAPTER_FACTORIES);
  const order = configured?.length ? configured : [...DEFAULT_ADAPTER_ORDER];
  return codexEnabled ? order : order.filter((id) => id !== 'codex');
}

/**
 * Whether any backend is explicitly configured. `web_search` is left out of the agent toolset
 * entirely when this is false, so the model never spends a turn on a tool that cannot answer.
 */
export async function webSearchStatus(): Promise<{
  providers: Array<{ id: string; configured: boolean; fromEnv: boolean }>;
  codex: { enabled: boolean; cliAvailable: boolean };
  configured: boolean;
}> {
  const providers = [];
  for (const spec of HTTP_SEARCH_SPECS) {
    const key = await readSearchApiKey(spec.id, spec.envVar);
    providers.push({
      id: spec.id,
      configured: key !== null,
      fromEnv: key !== null && key === process.env[spec.envVar]?.trim(),
    });
  }
  const enabled = isCodexSearchEnabled();
  const codexAdapter = getAdapter('codex');
  const cliAvailable = codexAdapter ? await codexAdapter.isAvailable() : false;
  return {
    providers,
    codex: { enabled, cliAvailable },
    configured: enabled || providers.some((provider) => provider.configured),
  };
}

export async function isWebSearchConfigured(): Promise<boolean> {
  if (isCodexSearchEnabled()) return true;
  for (const spec of HTTP_SEARCH_SPECS) {
    if (await readSearchApiKey(spec.id, spec.envVar)) return true;
  }
  return false;
}

export interface WebSearchOptions {
  query: string;
  recency?: SearchRecency;
  timeoutMs?: number;
  signal?: AbortSignal;
  adapters?: SearchAdapter[];
}

export async function runWebSearch(options: WebSearchOptions): Promise<string> {
  const adapters =
    options.adapters ??
    adapterOrder()
      .map((id) => getAdapter(id))
      .filter((adapter): adapter is SearchAdapter => adapter !== null);

  const timeoutMs = Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const failures: string[] = [];
  let availableCount = 0;

  for (const adapter of adapters) {
    if (!(await adapter.isAvailable())) continue;
    availableCount++;
    try {
      const response = await adapter.search({
        query: options.query,
        recency: options.recency,
        timeoutMs,
        signal: options.signal,
      });
      if (!hasRenderableContent(response)) {
        throw new SearchAdapterError(
          adapter.id,
          `${adapter.label} returned nothing for this query.`,
        );
      }
      return formatForLlm(response);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (availableCount === 0) {
    throw new Error(
      `No web search backend is available. Install one of: ${adapters.map((a) => a.label).join(', ')}.`,
    );
  }
  throw new Error(`All web search backends failed: ${failures.join('; ')}`);
}
