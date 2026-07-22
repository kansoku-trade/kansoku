import {
  type CandlePattern,
  type ChanStructure,
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
  type TimeframeKey,
} from '@kansoku/shared/types';
import { computeChanStructure } from '../chanlun/index.js';
import { ClientError } from '../../platform/errors.js';
import { detectFvgZones } from '../fvg.js';
import { lastVwap, sessionVwap } from '../vwap.js';
import { ema, findSwings, lineData, macd, sma, toTs } from '../indicators.js';
import { classifyMacdStructure, type MacdStructure } from '../macdStructure.js';
import { offSessionSignalKeeper } from '../patternScoring.js';
import { activeProDetectors } from '../../pro/detectors.js';
import { DEFAULT_EMA_PERIODS, MACD_MIN_BARS, VWAP_TIMEFRAMES } from './constants.js';

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
  chanStructure: ChanStructure;
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
  key: TimeframeKey,
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
  const proDetectors = activeProDetectors();
  const { detectCandlePatterns, enrichCandlePatterns } = proDetectors;
  const candlePatterns =
    detectCandlePatterns && enrichCandlePatterns
      ? enrichCandlePatterns(detectCandlePatterns(opens, highs, lows, closes, timesTs), {
          highs,
          lows,
          closes,
          vols,
          timesTs,
          emaArrs,
          swingHighs,
          swingLows,
          fvgZones,
        })
      : [];

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
  const findPriceDivergence = proDetectors.findPriceDivergence;
  const autoDivergence = findPriceDivergence
    ? [
        ...findPriceDivergence(withMacd(swingHighs), true),
        ...findPriceDivergence(withMacd(swingLows), false),
      ]
        .filter((d) => keepSignal(d.b.time))
        .sort((a, b) => a.b.time - b.b.time)
    : [];
  const autoBeichi = proDetectors.findMacdBeichi
    ? proDetectors
        .findMacdBeichi(hist, highs, lows, timesTs)
        .filter((d) => keepSignal(d.b.time))
        .sort((a, b) => a.b.time - b.b.time)
    : [];
  const pattern123 = proDetectors.detect123Patterns
    ? proDetectors
        .detect123Patterns(highs, lows, closes, timesTs)
        .filter((p) => keepSignal(p.confirm?.time ?? p.p3.time))
    : [];
  const secondBreakouts = proDetectors.detectSecondBreakouts
    ? proDetectors
        .detectSecondBreakouts(highs, lows, closes, timesTs)
        .filter((sb) => keepSignal(sb.trigger?.time ?? sb.signal.time))
    : [];
  structure.signals = structure.signals.filter((s) => keepSignal(s.time));
  const chanStructure = computeChanStructure(bars, hist, key);

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
    chanStructure,
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
