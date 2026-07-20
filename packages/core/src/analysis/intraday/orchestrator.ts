import {
  type CandlePattern,
  type IntradayBuilt,
  type IntradayContext,
  type IntradayEventRisk,
  type IntradayOptionsLevels,
  type IntradayPrediction,
  type IntradayTfData,
  type IntradayTfSummary,
  type NewsItem,
  type PredictionScenario,
  type RawBar,
  type SeriesMarker,
  type TimeframeKey,
} from '@kansoku/shared/types';
import { ClientError } from '../../platform/errors.js';
import { buildDayContext } from '../dayLevels.js';
import { toTs, pyRound } from '../indicators.js';
import { MACD_STRUCTURE_META, ZERO_TANGLE_NOTE } from '../macdStructure.js';
import { SCORE_DOT_MARKER, SCORE_FULL_MARKER } from '../patternScoring.js';
import { offSessionSegments } from '../../marketdata/session.js';
import { marketOf } from '../../symbols/symbol.utils.js';
import {
  ANCHOR_DIRECTION_STYLE,
  barTimeShort,
  BIAS_MARKER_STYLE,
  CONTEXT_STANCES,
  PATTERN_LABEL_SUFFIX,
  PATTERN_STATUS_TEXT,
  TIMEFRAME_LABELS,
  TIMEFRAME_ORDER,
} from './constants.js';
import { computeIntradayEntryPlan, resolveEntryPlanStatus } from './entryPlan.js';
import {
  autoPatternMarkers,
  buildIntradaySignals,
  capMarkersPerBar,
  mergeAiAutoMarkers,
  pattern123Overlay,
} from './markers.js';
import { coerceIntradayTimeframe, sanitizeEmaPeriods, type CoercedTimeframe } from './timeframe.js';

export interface IntradayInput {
  symbol: string;
  name?: string;
  as_of?: string;
  timeframes: Partial<Record<TimeframeKey, RawBar[]>>;
  day_kline?: RawBar[];
  ema_periods?: number[];
  news?: NewsItem[];
  position?: { shares?: number; cost?: number };
  prediction?: IntradayPrediction | null;
  context?: IntradayContext | null;
  options_levels?: IntradayOptionsLevels | null;
  event_risk?: IntradayEventRisk | null;
}

function validateIntradayContext(context: IntradayContext): void {
  if (typeof context.generated_at !== 'string' || !context.generated_at) {
    throw new ClientError(
      'intraday: context.generated_at must be a non-empty ISO timestamp string',
      'e.g. {"context": {"generated_at": "2026-07-05T14:00:00.000Z", ...}}',
    );
  }
  if (!CONTEXT_STANCES.has(context.conclusion?.stance)) {
    throw new ClientError(
      'intraday: context.conclusion.stance must be one of long | short | neutral',
      'e.g. {"conclusion": {"stance": "long", "summary": "...", "action": "..."}}',
    );
  }
  if (!Array.isArray(context.news)) {
    throw new ClientError('intraday: context.news must be an array (may be empty)');
  }
  if (!Array.isArray(context.sources_used)) {
    throw new ClientError('intraday: context.sources_used must be an array (may be empty)');
  }
}

function normalizeScenarios(raw: unknown): PredictionScenario[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((sc) => {
    const s = (sc && typeof sc === 'object' ? sc : {}) as Record<string, unknown>;
    const label = typeof s.label === 'string' ? s.label : typeof s.name === 'string' ? s.name : '';
    let probability = 0;
    if (typeof s.probability === 'number' && Number.isFinite(s.probability)) {
      probability = s.probability;
    } else if (typeof s.prob === 'number' && Number.isFinite(s.prob)) {
      probability = s.prob;
    }
    if (probability > 0 && probability <= 1) probability = probability * 100;
    return {
      label,
      probability,
      path: typeof s.path === 'string' ? s.path : undefined,
      trigger: typeof s.trigger === 'string' ? s.trigger : undefined,
    };
  });
}

export interface IntradayMeta {
  mode: 'prediction' | 'preview';
  bars: Record<TimeframeKey, number>;
  technicals: Record<TimeframeKey, IntradayTfSummary>;
  [key: string]: unknown;
}

export function buildIntraday(input: IntradayInput): { built: IntradayBuilt; meta: IntradayMeta } {
  const symbol = input.symbol;
  if (!symbol) throw new ClientError('intraday: input.symbol is required');
  const name = input.name || symbol;
  const asOf = input.as_of ?? '';

  const tfRaw = input.timeframes ?? {};
  const missing = TIMEFRAME_ORDER.filter((k) => !(k in tfRaw));
  if (missing.length) {
    throw new ClientError(
      `intraday: missing timeframes [${missing.join(', ')}]; need all of [${TIMEFRAME_ORDER.join(', ')}].`,
      'Pull each with `longbridge kline <SYM> --period <5m|15m|1h> --count 1000 --format json`.',
    );
  }

  const context = input.context ?? null;
  if (context) validateIntradayContext(context);

  const prediction = input.prediction
    ? {
        ...input.prediction,
        range_bound_plan: input.prediction.range_bound_plan ?? input.prediction.range_plan,
        scenarios: normalizeScenarios(input.prediction.scenarios),
      }
    : null;
  const emaPeriods = sanitizeEmaPeriods(input.ema_periods);
  const tfs = Object.fromEntries(
    TIMEFRAME_ORDER.map((k) => [k, coerceIntradayTimeframe(tfRaw[k] as RawBar[], k, emaPeriods)]),
  ) as Record<TimeframeKey, CoercedTimeframe>;
  const last = tfs.m5.lastClose;

  const direction = prediction?.direction ?? 'neutral';
  const anchor = prediction?.anchor;
  const signalsByTf = buildIntradaySignals(prediction?.signals);
  if (anchor && anchor.timeframe in signalsByTf) {
    const { label: dirLabel, shape, position } = ANCHOR_DIRECTION_STYLE[direction];
    signalsByTf[anchor.timeframe].markers.push({
      time: toTs(anchor.time),
      position,
      color: '#58a6ff',
      shape,
      text: `🎯 ${dirLabel}`,
      tooltip: `🎯 AI 预测锚点\n${TIMEFRAME_LABELS[anchor.timeframe]} · ${barTimeShort(toTs(anchor.time))} · $${Number(anchor.price).toFixed(2)}\n方向判断（${dirLabel}）基于这根 K 线做出`,
      group: 'ai',
    });
  }

  const epRaw = prediction?.entry_plan;
  const entryPlan =
    epRaw?.entry && epRaw.stop
      ? computeIntradayEntryPlan(epRaw, direction, prediction?.price_zones)
      : null;
  if (entryPlan) {
    const st = resolveEntryPlanStatus(
      entryPlan,
      direction,
      anchor ? toTs(anchor.time) : null,
      tfs.m5.candles,
    );
    entryPlan.entry_status = st?.status ?? null;
    entryPlan.entry_status_note = st?.note ?? null;
  }

  const timeframes = {} as Record<TimeframeKey, IntradayTfData>;
  for (const k of TIMEFRAME_ORDER) {
    const tf = tfs[k];
    const sig = signalsByTf[k];
    const autoDiv = autoPatternMarkers(tf.autoDivergence, 'divergence', '#ab47bc');
    const autoBei = autoPatternMarkers(tf.autoBeichi, 'beichi', '#ff8f00');
    const auto123 = pattern123Overlay(tf.pattern123, tf.candles.at(-1)!.time);
    const tangleSuffix = tf.structure.tangle ? `\n${ZERO_TANGLE_NOTE}` : '';
    const crossMarkers: SeriesMarker[] = tf.structure.signals.map((s, i) => {
      const meta = MACD_STRUCTURE_META[s.kind];
      const isZeroCross = s.kind === 'zero_cross_up' || s.kind === 'zero_cross_down';
      const pending = s.confirmed ? '' : '（最新 K 线，待确认）';
      return {
        time: s.time,
        position: 'inBar',
        color: meta.color,
        shape: isZeroCross ? 'square' : 'circle',
        text: s.confirmed ? s.label : `${s.label}?`,
        id: `x-${i}`,
        tooltip: `${s.bias === 'bullish' ? '🟢' : '🔴'} ${s.label} · ${barTimeShort(s.time)}${pending}\n${s.implication}${tangleSuffix}`,
      };
    });
    const barIndex = new Map(tf.candles.map((c, i) => [c.time, i]));
    const lastIdxByKind = new Map<CandlePattern['kind'], number>();
    const dedupedPatterns = tf.candlePatterns.filter((p) => {
      const idx = barIndex.get(p.time) ?? -1;
      const prevIdx = lastIdxByKind.get(p.kind);
      if (prevIdx !== undefined && idx - prevIdx <= 2) return false;
      lastIdxByKind.set(p.kind, idx);
      return true;
    });
    const patternMarkers: SeriesMarker[] = dedupedPatterns
      .filter((p) => (p.score ?? 0) >= SCORE_DOT_MARKER)
      .slice(-12)
      .map((p) => {
        const full = (p.score ?? 0) >= SCORE_FULL_MARKER;
        const dead = p.status === 'invalidated' || p.status === 'expired';
        const statusText = p.status ? PATTERN_STATUS_TEXT[p.status] : '无方向';
        const lines = [
          `🕯️ 自动·${p.label}（简化算法，仅供参考）`,
          `${barTimeShort(p.time)} $${p.price}`,
          `状态：${statusText} ｜ 含金量 ${p.score ?? 0}/100`,
        ];
        if (p.confirm_price != null && p.invalidate_price != null) {
          lines.push(
            `确认价 $${pyRound(p.confirm_price, 3)} ｜ 失效价 $${pyRound(p.invalidate_price, 3)}`,
          );
        }
        lines.push(p.implication);
        lines.push(
          p.stats ? `历史：近 ${p.stats.sample} 次确认后 ${p.stats.wins} 次走对` : '历史：样本不足',
        );
        const style = BIAS_MARKER_STYLE[p.bias];
        const suffix = p.status ? (PATTERN_LABEL_SUFFIX[p.status] ?? '') : '';
        return {
          time: p.time,
          position: style.position,
          color: dead ? '#6e7681' : style.color,
          shape: dead || !full ? 'circle' : style.shape,
          text: dead || !full ? '' : `${p.label}${suffix}`,
          tooltip: lines.join('\n'),
          group: 'candle',
        } satisfies SeriesMarker;
      });
    timeframes[k] = {
      candles: tf.candles,
      volumes: tf.volumes,
      emas: tf.emas,
      vwap: tf.vwap,
      macdDif: tf.macdDif,
      macdDea: tf.macdDea,
      macdHist: tf.macdHist,
      macdCrossMarkers: crossMarkers,
      markers: capMarkersPerBar([
        ...mergeAiAutoMarkers(sig.markers, [...autoDiv.markers, ...autoBei.markers], barIndex),
        ...auto123.markers,
        ...patternMarkers,
      ]).map((m, i) => ({ ...m, id: `m-${i}` })),
      priceConnectors: [
        ...sig.priceConnectors,
        ...autoDiv.priceConnectors,
        ...autoBei.priceConnectors,
        ...auto123.priceConnectors,
      ],
      macdConnectors: [...sig.macdConnectors, ...autoDiv.macdConnectors, ...autoBei.macdConnectors],
      autoDivergence: tf.autoDivergence,
      autoBeichi: tf.autoBeichi,
      pattern123: tf.pattern123,
      secondBreakouts: tf.secondBreakouts,
      fvgZones: tf.fvgZones,
      offSession: offSessionSegments(
        tf.candles.map((c) => c.time),
        marketOf(symbol),
      ),
    };
  }

  const defaultTf: TimeframeKey = anchor?.timeframe ?? 'm15';
  const technicals = Object.fromEntries(TIMEFRAME_ORDER.map((k) => [k, tfs[k].summary])) as Record<
    TimeframeKey,
    IntradayTfSummary
  >;
  const lastM5 = tfs.m5.candles.at(-1)!;
  const dayContext = buildDayContext(
    input.day_kline ?? [],
    tfRaw.m5 as RawBar[],
    new Date(lastM5.time * 1000),
    tfs.m5.summary.last_vwap ?? null,
  );

  const shares = input.position?.shares;
  const cost = input.position?.cost;
  const position =
    shares && cost
      ? { shares, cost, unrealized: (last - cost) * shares, unrealizedPct: (last / cost - 1) * 100 }
      : null;

  const built: IntradayBuilt = {
    kind: 'intraday',
    timeframes,
    defaultTf,
    entryPlan,
    sidebar: {
      symbol,
      name,
      asOf,
      last,
      prediction,
      entryPlan,
      position,
      technicals,
      dayContext,
      optionsLevels: input.options_levels ?? null,
      eventRisk: input.event_risk ?? null,
      news: input.news ?? [],
      context,
    },
  };

  const meta: IntradayMeta = {
    mode: prediction ? 'prediction' : 'preview',
    bars: Object.fromEntries(TIMEFRAME_ORDER.map((k) => [k, tfs[k].candles.length])) as Record<
      TimeframeKey,
      number
    >,
    technicals,
    day_context: dayContext,
    options_levels: input.options_levels ?? null,
    event_risk: input.event_risk ?? null,
  };

  return { built, meta };
}
