import type { RawBar } from '@kansoku/shared/types';
import { macd, sma } from '../../../core/src/analysis/indicators.js';

export interface DayIndicators {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  macd: { dif: (number | null)[]; dea: (number | null)[]; hist: (number | null)[] };
}

export interface WeekIndicators {
  sma10: number | null;
  sma30: number | null;
}

function lastValue(values: (number | null)[]): number | null {
  return values.at(-1) ?? null;
}

function closes(bars: RawBar[]): number[] {
  return bars.map((bar) => Number(bar.close));
}

export function buildDayIndicators(bars: RawBar[]): DayIndicators {
  const closeValues = closes(bars);
  const { dif, dea, hist } = macd(closeValues, 12, 26, 9);
  return {
    sma20: lastValue(sma(closeValues, 20)),
    sma50: lastValue(sma(closeValues, 50)),
    sma200: lastValue(sma(closeValues, 200)),
    macd: {
      dif: dif.slice(-60),
      dea: dea.slice(-60),
      hist: hist.slice(-60),
    },
  };
}

export function buildWeekIndicators(bars: RawBar[]): WeekIndicators {
  const closeValues = closes(bars);
  return {
    sma10: lastValue(sma(closeValues, 10)),
    sma30: lastValue(sma(closeValues, 30)),
  };
}
