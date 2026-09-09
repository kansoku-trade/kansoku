import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Api, Model, ThinkingLevelMap } from '@earendil-works/pi-ai';

interface CodexCatalogEntry {
  slug?: unknown;
  display_name?: unknown;
  visibility?: unknown;
  priority?: unknown;
  context_window?: unknown;
  input_modalities?: unknown;
  supported_reasoning_levels?: unknown;
}

export function defaultCodexModelsCachePath(): string {
  const home = process.env.CODEX_HOME || path.join(homedir(), '.codex');
  return path.join(home, 'models_cache.json');
}

function readEntries(cachePath: string): CodexCatalogEntry[] {
  const parsed = JSON.parse(readFileSync(cachePath, 'utf8')) as { models?: unknown };
  return Array.isArray(parsed.models) ? (parsed.models as CodexCatalogEntry[]) : [];
}

function thinkingLevelMap(entry: CodexCatalogEntry): ThinkingLevelMap {
  const efforts = new Set(
    (Array.isArray(entry.supported_reasoning_levels) ? entry.supported_reasoning_levels : [])
      .map((level) => (level as { effort?: unknown } | null)?.effort)
      .filter((effort): effort is string => typeof effort === 'string'),
  );
  return {
    minimal: 'low',
    low: efforts.has('low') ? 'low' : null,
    medium: efforts.has('medium') ? 'medium' : null,
    high: efforts.has('high') ? 'high' : null,
    xhigh: efforts.has('xhigh') ? 'xhigh' : null,
    max: efforts.has('max') ? 'max' : null,
  };
}

function toModel(
  entry: CodexCatalogEntry,
  template: Model<Api>,
  builtin: Model<Api> | undefined,
): Model<Api> | null {
  const id = entry.slug;
  if (typeof id !== 'string' || !id || entry.visibility !== 'list') return null;
  const modalities = Array.isArray(entry.input_modalities) ? entry.input_modalities : [];
  const input = (['text', 'image'] as const).filter((kind) => modalities.includes(kind));
  const contextWindow =
    typeof entry.context_window === 'number' ? entry.context_window : template.contextWindow;
  return {
    ...template,
    ...builtin,
    id,
    name: typeof entry.display_name === 'string' ? entry.display_name : (builtin?.name ?? id),
    input: input.length > 0 ? input : ['text'],
    contextWindow,
    maxTokens: Math.min(builtin?.maxTokens ?? template.maxTokens, contextWindow),
    // 新模型没有公开价格，宁可算 0 也不用别的模型的价格冒充。
    cost: builtin?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    thinkingLevelMap: thinkingLevelMap(entry),
  };
}

export function createCodexModelCatalog(
  builtinModels: readonly Model<Api>[],
  cachePath = defaultCodexModelsCachePath(),
): () => readonly Model<Api>[] {
  const template = builtinModels[0];
  let cachedMtimeMs: number | null = null;
  let cachedModels: readonly Model<Api>[] = builtinModels;

  return () => {
    if (!template) return builtinModels;
    let mtimeMs: number;
    try {
      mtimeMs = statSync(cachePath).mtimeMs;
    } catch {
      return builtinModels;
    }
    if (mtimeMs === cachedMtimeMs) return cachedModels;
    try {
      const byId = new Map(builtinModels.map((model) => [model.id, model]));
      const models = readEntries(cachePath)
        .map((entry) =>
          toModel(entry, template, typeof entry.slug === 'string' ? byId.get(entry.slug) : undefined),
        )
        .filter((model): model is Model<Api> => model !== null);
      cachedMtimeMs = mtimeMs;
      cachedModels = models.length > 0 ? models : builtinModels;
    } catch {
      cachedMtimeMs = mtimeMs;
      cachedModels = builtinModels;
    }
    return cachedModels;
  };
}
