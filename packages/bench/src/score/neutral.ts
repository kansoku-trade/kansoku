import type { RawBar } from '@kansoku/shared/types';
import { sma } from '../../../core/src/analysis/indicators.js';
import { num } from './replay.js';

export type Regime = 'up' | 'down';

export function atr14(dayBars: RawBar[]): number | null {
  const window = dayBars.slice(-15);
  if (window.length < 2) return null;
  let sum = 0;
  let count = 0;
  for (let i = 1; i < window.length; i++) {
    const high = num(window[i].high);
    const low = num(window[i].low);
    const prevClose = num(window[i - 1].close);
    const trueRange = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    sum += trueRange;
    count += 1;
  }
  return count > 0 ? sum / count : null;
}

export function cutoffCloseOf(dayBars: RawBar[]): number {
  const last = dayBars.at(-1);
  return last ? num(last.close) : Number.NaN;
}

export function neutralCorrect(cutoffClose: number, atr: number, replayBars: RawBar[]): boolean {
  const band = 2 * atr;
  return replayBars.every((bar) => Math.abs(num(bar.close) - cutoffClose) <= band);
}

export function regimeOf(dayBars: RawBar[]): Regime {
  const closes = dayBars.map((bar) => num(bar.close));
  if (closes.length === 0) return 'down';
  const series = sma(closes, 50);
  const last = series.at(-1);
  const close = closes.at(-1)!;
  const threshold = last ?? closes.reduce((acc, value) => acc + value, 0) / closes.length;
  return close > threshold ? 'up' : 'down';
}
