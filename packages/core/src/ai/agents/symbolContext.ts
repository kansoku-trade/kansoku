import type { NewsItem, RawBar } from '@kansoku/shared/types';
import { getProvider } from '../../marketdata/registry.js';
import { marketOf } from '../../symbols/symbol.utils.js';
import { buildReassessPack as defaultBuildReassessPack, type ReassessPack } from './datapack.js';

export interface SymbolContext {
  buildPack: (symbol: string) => Promise<ReassessPack>;
  fetchKline: (symbol: string, period: string, count: number) => Promise<RawBar[]>;
  fetchNews: (symbol: string) => Promise<NewsItem[]>;
}

export function resolveSymbolContext(overrides: Partial<SymbolContext> = {}): SymbolContext {
  return {
    buildPack: overrides.buildPack ?? defaultBuildReassessPack,
    fetchKline:
      overrides.fetchKline ??
      ((symbol, period, count) => getProvider(marketOf(symbol)).getKline(symbol, period, count)),
    fetchNews: overrides.fetchNews ?? ((symbol) => getProvider(marketOf(symbol)).getNews(symbol)),
  };
}
