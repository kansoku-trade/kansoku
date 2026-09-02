import type { CandleFeed, QuoteCell } from './shared.js';
export declare function useQuote(symbol: string): QuoteCell | null;
export declare function useCandles(symbol: string): CandleFeed | null;
