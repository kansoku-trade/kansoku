export interface TapeSymbol {
  cboe: string;
  symbol: string;
}

export const TAPE_SYMBOLS: TapeSymbol[] = [
  { cboe: '_SPX', symbol: 'SPX' },
  { cboe: '_NDX', symbol: 'NDX' },
  { cboe: '_VIX', symbol: 'VIX' },
];

export interface TapeQuote {
  symbol: string;
  last: number;
  changePercent: number;
}

export type TapeDirection = 'up' | 'down' | 'flat';

const SYMBOL_RE = /^[A-Z0-9]{1,6}$/;

export const parseTapeQuotes = (payload: unknown): TapeQuote[] => {
  if (typeof payload !== 'object' || payload === null) return [];
  const quotes = (payload as { quotes?: unknown }).quotes;
  if (!Array.isArray(quotes)) return [];

  const parsed: TapeQuote[] = [];
  for (const entry of quotes) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { symbol, last, changePercent } = entry as Record<string, unknown>;
    if (typeof symbol !== 'string' || !SYMBOL_RE.test(symbol)) continue;
    if (typeof last !== 'number' || !Number.isFinite(last)) continue;
    if (typeof changePercent !== 'number' || !Number.isFinite(changePercent)) continue;
    parsed.push({ symbol, last, changePercent });
  }
  return parsed;
};

const roundPercent = (value: number): number => Number(value.toFixed(2));

export const tapeDirection = (changePercent: number): TapeDirection => {
  const rounded = roundPercent(changePercent);
  if (rounded > 0) return 'up';
  if (rounded < 0) return 'down';
  return 'flat';
};

export const formatTapeLast = (last: number): string => last.toFixed(2);

export const formatTapeChange = (changePercent: number): string => {
  const rounded = roundPercent(changePercent);
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
  return `${sign}${Math.abs(rounded).toFixed(2)}%`;
};
