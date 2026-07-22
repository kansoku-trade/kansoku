import type { Candle, IntradayFvgZone } from '@kansoku/shared/types';

const ATR_PERIOD = 14;
export const FVG_ATR_RATIO = 0.25;
export const FVG_MIN_PCT = 0.003;
export const FVG_MAX_AGE = 40;

function atr(candles: Candle[], period: number): (number | null)[] {
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i === 0) {
      tr.push(c.high - c.low);
      continue;
    }
    const prevClose = candles[i - 1].close;
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose)));
  }
  const out: (number | null)[] = [];
  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += tr[j];
    out.push(sum / period);
  }
  return out;
}

export function detectFvgZones(candles: Candle[]): IntradayFvgZone[] {
  const n = candles.length;
  if (n < 3) return [];
  const atrArr = atr(candles, ATR_PERIOD);
  const out: IntradayFvgZone[] = [];

  for (let i = 1; i < n - 1; i++) {
    const prev = candles[i - 1];
    const next = candles[i + 1];
    let kind: IntradayFvgZone['kind'] | null = null;
    let low = 0;
    let high = 0;
    if (prev.high < next.low) {
      kind = 'bullish';
      low = prev.high;
      high = next.low;
    } else if (prev.low > next.high) {
      kind = 'bearish';
      low = next.high;
      high = prev.low;
    }
    if (!kind) continue;
    if (n - 1 - i > FVG_MAX_AGE) continue;

    const size = high - low;
    if (size / ((high + low) / 2) < FVG_MIN_PCT) continue;
    const a = atrArr[i];
    if (a !== null && size < FVG_ATR_RATIO * a) continue;

    let filled = false;
    let activeLow = low;
    let activeHigh = high;
    for (let j = i + 2; j < n; j++) {
      if (kind === 'bullish') {
        if (candles[j].low <= low) {
          filled = true;
          break;
        }
        if (candles[j].low < activeHigh) activeHigh = candles[j].low;
      } else {
        if (candles[j].high >= high) {
          filled = true;
          break;
        }
        if (candles[j].high > activeLow) activeLow = candles[j].high;
      }
    }
    if (filled) continue;

    const activeSize = activeHigh - activeLow;
    out.push({
      startTime: candles[i].time,
      low,
      high,
      kind,
      activeLow,
      activeHigh,
      mitigationRatio: Math.max(0, Math.min(1, 1 - activeSize / size)),
      ageBars: n - 1 - i,
      gapRatio: size / ((high + low) / 2),
    });
  }

  return out;
}
