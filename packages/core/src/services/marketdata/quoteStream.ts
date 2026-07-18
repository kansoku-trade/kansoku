import type { QuoteCell } from "@kansoku/shared/types";
import type { CandleBar, CandlePeriod } from "./candleAggregator.js";

export type { CandleBar, CandlePeriod };

export type QuoteListener = (cell: QuoteCell) => void;
export type CandleListener = (bar: CandleBar) => void;

export interface QuoteStream {
  retain(symbols: string[]): Promise<void>;
  release(symbols: string[]): Promise<void>;
  subscribeCandlesticks(symbol: string, period: CandlePeriod, cb: CandleListener): () => void;
  onUpdate(listener: QuoteListener): () => void;
  getSnapshot(symbol: string): QuoteCell | undefined;
}
