import { ClientError } from '../../platform/errors.js';
import { marketOf, normalizeSymbol, type Market } from '../../symbols/symbol.utils.js';

interface YahooMarketMapping {
  toYahoo(base: string): string;
  fromYahoo(yahooSymbol: string): string;
}

const UNSUPPORTED_HINT = 'market not supported by the yahoo provider yet';

const usMapping: YahooMarketMapping = {
  toYahoo: (base) => (base.startsWith('.') ? `^${base.slice(1)}` : base),
  fromYahoo: (yahooSymbol) => (yahooSymbol.startsWith('^') ? `.${yahooSymbol.slice(1)}.US` : `${yahooSymbol}.US`),
};

const marketMappings: Partial<Record<Market, YahooMarketMapping>> = {
  US: usMapping,
};

function splitMarketSuffix(normalized: string): { base: string } {
  const dot = normalized.lastIndexOf('.');
  return { base: normalized.slice(0, dot) };
}

function unsupported(symbol: string): ClientError {
  return new ClientError(`symbol not supported by yahoo provider: ${symbol}`, UNSUPPORTED_HINT);
}

export function toYahooSymbol(canonical: string): string {
  const normalized = normalizeSymbol(canonical);
  const mapping = marketMappings[marketOf(normalized)];
  if (!mapping) throw unsupported(normalized);
  const { base } = splitMarketSuffix(normalized);
  return mapping.toYahoo(base);
}

export function fromYahooSymbol(yahooSymbol: string): string {
  if (yahooSymbol.includes('.')) throw unsupported(yahooSymbol);
  return marketMappings.US!.fromYahoo(yahooSymbol);
}
