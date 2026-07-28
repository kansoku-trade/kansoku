import raw from '../../../data/market-snapshot.json';
import type { Candle } from '../kline';

export type Bar = [
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
];

export interface SepaCheck {
  label: string;
  status: 'pass' | 'fail' | 'unknown';
  val: string;
}

export interface MarketSnapshot {
  capturedAt: string;
  source: string;
  chart: {
    symbol: string;
    name: string;
    last: number;
    changePct: number;
    levels: Array<{ label: string; value: number; tone: 'pre' | 'prev' | 'anchor' }>;
    timeframes: Record<string, Bar[]>;
    stats: {
      high52: number;
      low52: number;
      ma50: number;
      ma150: number;
      ma200: number;
      fromHigh: number;
      fromLow: number;
      fromMa50: number;
    };
    sepa: {
      checks: SepaCheck[];
      verdict: { label: string; tier: 'pass' | 'watch'; reason: string };
    };
    prediction: {
      direction: 'long' | 'short' | 'neutral';
      anchor: { timeframe: string; price: number };
      scenarios: Array<{ label: string; probability: number; path: string; trigger: string }>;
      rangePlan: {
        low: number;
        high: number;
        condition: string;
        longTactic: string;
        shortTactic: string;
      };
      stats: { dayHigh: number; dayLow: number; vwap: number };
    };
  };
  trainer: { period: string; bars: Bar[] };
}

// The JSON import widens each fixed-length bar tuple to number[]; the tuple shape is enforced by
// the fetch script that writes the file, not by TypeScript.
export const snapshot = raw as unknown as MarketSnapshot;

export const toCandles = (bars: Bar[]): Candle[] =>
  bars.map(([time, open, high, low, close]) => ({
    time,
    open,
    high,
    low,
    close,
    up: close >= open,
  }));

export const volumesOf = (bars: Bar[]): number[] => bars.map((bar) => bar[5]);

export const TIMEFRAMES = Object.keys(snapshot.chart.timeframes);
