import { marketOf, type Market } from '../symbols/symbol.utils.js';
import { getStream } from './registry.js';
import type { QuoteStream } from './quoteStream.js';

const MARKETS: Market[] = ['US', 'HK', 'CN'];

export function distinctStreams(): QuoteStream[] {
  const set = new Set<QuoteStream>();
  for (const market of MARKETS) set.add(getStream(market));
  return [...set];
}

function groupByMarket(symbols: string[]): Array<[Market, string[]]> {
  const groups = new Map<Market, string[]>();
  for (const symbol of symbols) {
    const market = marketOf(symbol);
    const list = groups.get(market) ?? [];
    list.push(symbol);
    groups.set(market, list);
  }
  return [...groups];
}

export async function retainSymbols(symbols: string[]): Promise<void> {
  await Promise.all(
    groupByMarket(symbols).map(([market, group]) => getStream(market).retain(group)),
  );
}

export async function releaseSymbols(symbols: string[]): Promise<void> {
  await Promise.all(
    groupByMarket(symbols).map(([market, group]) => getStream(market).release(group)),
  );
}
