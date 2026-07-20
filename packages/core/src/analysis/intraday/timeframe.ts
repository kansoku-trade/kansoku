import {
  type CandlePattern,
  type ColoredPoint,
  type DivergencePair,
  type DivergencePoint,
  type EmaLine,
  type IntradayFvgZone,
  type IntradayTfData,
  type IntradayTfSummary,
  type MacdCross,
  type Pattern123,
  type RawBar,
  type SecondBreakout,
} from '@kansoku/shared/types';
import { ClientError } from '../../platform/errors.js';
import { detectCandlePatterns } from '../candlePatterns/detect.js';
import { detectFvgZones } from '../fvg.js';
import { lastVwap, sessionVwap } from '../vwap.js';
import { ema, findSwings, lineData, macd, sma, toTs } from '../indicators.js';
import { classifyMacdStructure, type MacdStructure } from '../macdStructure.js';
import { detect123Patterns } from '../pattern123.js';
import { detectSecondBreakouts } from '../secondBreakout.js';
import { enrichCandlePatterns, offSessionSignalKeeper } from '../patternScoring.js';
import {
  BEICHI_WEAKER_RATIO,
  DEFAULT_EMA_PERIODS,
  MACD_MIN_BARS,
  MIN_PUSH_BARS,
  VWAP_TIMEFRAMES,
} from './constants.js';

export function findMacdCrosses(hist: (number | null)[], timesTs: number[]): MacdCross[] {
  const out: MacdCross[] = [];
  let prev: number | null = null;
  for (let i = 0; i < hist.length; i++) {
    const h = hist[i];
    if (h === null) continue;
    if (prev !== null) {
      if (prev <= 0 && h > 0) out.push({ time: timesTs[i], type: 'golden' });
      else if (prev >= 0 && h < 0) out.push({ time: timesTs[i], type: 'death' });
    }
    prev = h;
  }
  return out;
}

export function findPriceDivergence(
  swingPoints: DivergencePoint[],
  isHigh: boolean,
): DivergencePair[] {
  const out: DivergencePair[] = [];
  for (let i = 0; i + 1 < swingPoints.length; i++) {
    const a = swingPoints[i];
    const b = swingPoints[i + 1];
    if (isHigh && b.price > a.price && b.macd_value < a.macd_value) {
      out.push({ kind: 'top', a, b });
    } else if (!isHigh && b.price < a.price && b.macd_value > a.macd_value) {
      out.push({ kind: 'bottom', a, b });
    }
  }
  return out;
}

interface Push {
  start: number;
  end: number;
  sign: 1 | -1;
}

export function macdPushes(hist: (number | null)[]): Push[] {
  const pushes: Push[] = [];
  let i = 0;
  const n = hist.length;
  while (i < n) {
    const h = hist[i];
    if (h === null || h === 0) {
      i += 1;
      continue;
    }
    const sign = h > 0 ? 1 : -1;
    let j = i;
    while (j < n) {
      const hj = hist[j];
      if (hj === null || (sign > 0 ? hj <= 0 : hj >= 0)) break;
      j += 1;
    }
    if (j - i >= MIN_PUSH_BARS) pushes.push({ start: i, end: j - 1, sign });
    i = j > i ? j : i + 1;
  }
  return pushes;
}

export function findMacdBeichi(
  hist: (number | null)[],
  highs: number[],
  lows: number[],
  timesTs: number[],
): DivergencePair[] {
  const pushes = macdPushes(hist);
  const out: DivergencePair[] = [];
  const area = (p: Push) => {
    let s = 0;
    for (let j = p.start; j <= p.end; j++) s += Math.abs(hist[j] ?? 0);
    return s;
  };
  const argExtreme = (p: Push, arr: number[], isMax: boolean) => {
    let best = p.start;
    for (let j = p.start + 1; j <= p.end; j++) {
      if (isMax ? arr[j] > arr[best] : arr[j] < arr[best]) best = j;
    }
    return best;
  };
  for (let k = 2; k < pushes.length; k++) {
    const prev = pushes[k - 2];
    const curr = pushes[k];
    if (prev.sign !== curr.sign) continue;
    if (area(curr) >= area(prev) * BEICHI_WEAKER_RATIO) continue;
    let kind: 'top' | 'bottom';
    let prevI: number;
    let currI: number;
    let prevPrice: number;
    let currPrice: number;
    if (curr.sign > 0) {
      prevI = argExtreme(prev, highs, true);
      currI = argExtreme(curr, highs, true);
      if (highs[currI] <= highs[prevI]) continue;
      kind = 'top';
      prevPrice = highs[prevI];
      currPrice = highs[currI];
    } else {
      prevI = argExtreme(prev, lows, false);
      currI = argExtreme(curr, lows, false);
      if (lows[currI] >= lows[prevI]) continue;
      kind = 'bottom';
      prevPrice = lows[prevI];
      currPrice = lows[currI];
    }
    out.push({
      kind,
      a: { time: timesTs[prevI], price: prevPrice, macd_value: hist[prevI] as number },
      b: { time: timesTs[currI], price: currPrice, macd_value: hist[currI] as number },
    });
  }
  return out;
}

export interface CoercedTimeframe {
  candles: IntradayTfData['candles'];
  volumes: ColoredPoint[];
  emas: EmaLine[];
  vwap: IntradayTfData['vwap'];
  macdDif: IntradayTfData['macdDif'];
  macdDea: IntradayTfData['macdDea'];
  macdHist: ColoredPoint[];
  macdCrosses: MacdCross[];
  structure: MacdStructure;
  candlePatterns: CandlePattern[];
  autoDivergence: DivergencePair[];
  autoBeichi: DivergencePair[];
  pattern123: Pattern123[];
  secondBreakouts: SecondBreakout[];
  fvgZones: IntradayFvgZone[];
  lastClose: number;
  summary: IntradayTfSummary;
}

export function sanitizeEmaPeriods(raw: unknown): number[] {
  if (!Array.isArray(raw)) return DEFAULT_EMA_PERIODS;
  const periods = raw
    .map((p) => Math.trunc(Number(p)))
    .filter((p) => Number.isFinite(p) && p >= 2 && p <= 250)
    .slice(0, 4);
  return periods.length ? periods : DEFAULT_EMA_PERIODS;
}

export function coerceIntradayTimeframe(
  bars: RawBar[],
  key: string,
  emaPeriods = DEFAULT_EMA_PERIODS,
): CoercedTimeframe {
  if (!bars || bars.length < MACD_MIN_BARS) {
    throw new ClientError(
      `intraday: timeframe '${key}' needs at least ${MACD_MIN_BARS} bars (got ${bars?.length ?? 0}); ` +
        'MACD(12,26,9) needs slow+signal warm-up plus history for swing detection.',
      `Pull more history: \`longbridge kline <SYM> --period ${key} --count 1000 --format json\`.`,
    );
  }
  const timesTs = bars.map((b) => toTs(b.time));
  const opens = bars.map((b) => Number(b.open));
  const highs = bars.map((b) => Number(b.high));
  const lows = bars.map((b) => Number(b.low));
  const closes = bars.map((b) => Number(b.close));
  const vols = bars.map((b) => Number(b.volume));

  const { dif, dea, hist } = macd(closes);
  const vol20 = sma(vols, 20);
  const emaArrs = emaPeriods.map((p) => ({ period: p, arr: ema(closes, p) }));

  const candles = timesTs.map((t, i) => ({
    time: t,
    open: opens[i],
    high: highs[i],
    low: lows[i],
    close: closes[i],
  }));
  const volumes: ColoredPoint[] = timesTs.map((t, i) => {
    let color = closes[i] >= opens[i] ? '#26a69a' : '#ef5350';
    const v20 = vol20[i];
    if (v20 !== null && vols[i] >= 1.5 * v20) color = '#ff5722';
    return { time: t, value: vols[i], color };
  });

  const histBars: ColoredPoint[] = [];
  for (let i = 0; i < timesTs.length; i++) {
    const h = hist[i];
    if (h === null) continue;
    histBars.push({ time: timesTs[i], value: h, color: h >= 0 ? '#26a69a' : '#ef5350' });
  }

  const { swingHighs, swingLows } = findSwings(highs, lows, timesTs);
  const lastNonNull = (arr: (number | null)[]) => {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null) return arr[i];
    return null;
  };

  const vwap = VWAP_TIMEFRAMES.has(key) ? sessionVwap(bars) : undefined;
  const macdCrosses = findMacdCrosses(hist, timesTs);
  const structure = classifyMacdStructure(dif, hist, timesTs);
  const fvgZones = detectFvgZones(candles);
  const candlePatterns = enrichCandlePatterns(
    detectCandlePatterns(opens, highs, lows, closes, timesTs),
    {
      highs,
      lows,
      closes,
      vols,
      timesTs,
      emaArrs,
      swingHighs,
      swingLows,
      fvgZones,
    },
  );

  const histByTime = new Map<number, number>();
  for (let i = 0; i < hist.length; i++) {
    const h = hist[i];
    if (h !== null) histByTime.set(timesTs[i], h);
  }
  const withMacd = (pts: { time: number; price: number }[]): DivergencePoint[] =>
    pts
      .filter((p) => histByTime.has(p.time))
      .map((p) => ({ ...p, macd_value: histByTime.get(p.time) as number }));

  const keepSignal = offSessionSignalKeeper(timesTs, vols);
  const autoDivergence = [
    ...findPriceDivergence(withMacd(swingHighs), true),
    ...findPriceDivergence(withMacd(swingLows), false),
  ]
    .filter((d) => keepSignal(d.b.time))
    .sort((a, b) => a.b.time - b.b.time);
  const autoBeichi = findMacdBeichi(hist, highs, lows, timesTs)
    .filter((d) => keepSignal(d.b.time))
    .sort((a, b) => a.b.time - b.b.time);
  const pattern123 = detect123Patterns(highs, lows, closes, timesTs).filter((p) =>
    keepSignal(p.confirm?.time ?? p.p3.time),
  );
  const secondBreakouts = detectSecondBreakouts(highs, lows, closes, timesTs).filter((sb) =>
    keepSignal(sb.trigger?.time ?? sb.signal.time),
  );
  structure.signals = structure.signals.filter((s) => keepSignal(s.time));

  return {
    candles,
    volumes,
    emas: emaArrs.map(({ period, arr }) => ({ period, data: lineData(timesTs, arr) })),
    vwap,
    macdDif: lineData(timesTs, dif),
    macdDea: lineData(timesTs, dea),
    macdHist: histBars,
    macdCrosses,
    structure,
    candlePatterns,
    autoDivergence,
    autoBeichi,
    pattern123,
    secondBreakouts,
    fvgZones,
    lastClose: closes.at(-1)!,
    summary: {
      last_dif: lastNonNull(dif),
      last_dea: lastNonNull(dea),
      last_hist: lastNonNull(hist),
      last_vwap: vwap ? lastVwap(vwap) : null,
      emas: emaArrs.map(({ period, arr }) => ({ period, last: lastNonNull(arr) })),
      recent_swing_highs: swingHighs.slice(-6),
      recent_swing_lows: swingLows.slice(-6),
      last_cross: macdCrosses.at(-1) ?? null,
      divergence_candidates: autoDivergence.slice(-3),
      beichi_candidates: autoBeichi.slice(-3),
      structure_signals: structure.signals.slice(-6),
      zero_tangle: structure.tangle,
      candle_patterns: candlePatterns.slice(-6),
      pattern_123: pattern123.slice(-2),
      second_breakouts: secondBreakouts.slice(-2),
    },
  };
}
