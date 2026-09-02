import type { CandleFeed, QuoteCell } from '@kansoku/shared/types';
export declare function useQuote(symbol: string): QuoteCell | null;
export declare function useCandles(symbol: string): CandleFeed | null;
