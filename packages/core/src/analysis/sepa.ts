import type {
  CheckStatus,
  ColoredPoint,
  NewsItem,
  RawBar,
  SepaBuilt,
  SepaCheck,
  SepaChartData,
  SepaEntryPlan,
  SepaVerdict,
  SeriesMarker,
  SupportZone,
} from '@kansoku/shared/types';
import { ClientError } from '../platform/errors.js';
import { coerceKlines, lineData, pyRound, rsSeries, sma, toCandles } from './indicators.js';
import { computeVolumeProfile, defaultSupportZones, normalizeSupportZones } from './zones.js';

const fmt = (x: number, d: number) => x.toFixed(d);
const signed = (x: number, d: number) => (x >= 0 ? '+' : '') + x.toFixed(d);

export interface SepaContext {
  earnings_dates?: string[];
  stage?: string;
  stage_note?: string;
  base_count?: string;
  pattern?: string;
  verdict?: SepaVerdict;
  entry_plan?: {
    pivot: number;
    stop?: number;
    target1_pct?: number;
    target2_pct?: number;
    note?: string;
    hypothetical?: boolean;
  };
  support_zones?: Partial<SupportZone>[] | null;
  auto_support_zones?: boolean;
  volume_profile?: { lookback_days?: number; bins?: number };
}

export interface SepaInput {
  symbol: string;
  name?: string;
  as_of_date?: string;
  kline: RawBar[];
  spy_kline?: RawBar[];
  news?: NewsItem[];
  position?: { shares?: number; cost?: number };
  context?: SepaContext;
}

export interface SepaMeta {
  verdict_tier: string;
  fails: number;
  passes: number;
  bars: number;
  [key: string]: unknown;
}

function detectMarkers(
  timesTs: number[],
  dates: string[],
  opens: number[],
  highs: number[],
  closes: number[],
  vols: number[],
  vol20: (number | null)[],
  ma50: (number | null)[],
  ma200: (number | null)[],
  high52w: number,
  earningsDates: string[],
): SeriesMarker[] {
  const markers: SeriesMarker[] = [];

  for (const d of earningsDates) {
    const i = dates.indexOf(d);
    if (i >= 0) {
      markers.push({
        time: timesTs[i],
        position: 'belowBar',
        color: '#2196f3',
        shape: 'circle',
        text: 'E 财报',
      });
    }
  }

  for (let i = 20; i < closes.length; i++) {
    const v20 = vol20[i];
    if (v20 && vols[i] >= 2.5 * v20 && closes[i] < opens[i]) {
      const windowStart = Math.max(0, i - 5);
      if (highs[i] === Math.max(...highs.slice(windowStart, i + 1))) {
        markers.push({
          time: timesTs[i],
          position: 'aboveBar',
          color: '#d32f2f',
          shape: 'arrowDown',
          text: `🔺 climax top (${fmt(vols[i] / 1e6, 0)}M, ${fmt(vols[i] / v20, 1)}×)`,
        });
      }
    }
  }

  for (let i = 1; i < closes.length; i++) {
    const prev = ma50[i - 1];
    const curr = ma50[i];
    if (prev && curr && closes[i - 1] >= prev && closes[i] < curr) {
      markers.push({
        time: timesTs[i],
        position: 'belowBar',
        color: '#ff9800',
        shape: 'arrowDown',
        text: '⬇ 跌破 MA50',
      });
    }
  }

  for (let i = 1; i < closes.length; i++) {
    const prev = ma200[i - 1];
    const curr = ma200[i];
    if (prev && curr && closes[i - 1] >= prev && closes[i] < curr) {
      markers.push({
        time: timesTs[i],
        position: 'belowBar',
        color: '#d32f2f',
        shape: 'arrowDown',
        text: '⬇ 跌破 MA200 (Stage 3 转 Stage 4)',
      });
    }
  }

  const hi = highs.indexOf(high52w);
  if (hi >= 0) {
    markers.push({
      time: timesTs[hi],
      position: 'aboveBar',
      color: '#9c27b0',
      shape: 'square',
      text: `52w 高 $${fmt(high52w, 2)}`,
    });
  }

  markers.sort((a, b) => a.time - b.time);
  return markers;
}

export function computeChecks(
  last: number,
  ma50: number,
  ma150: number,
  ma200: number,
  ma2001m: number | null,
  ma2004m: number | null,
  high52w: number,
  low52w: number,
  rsExcess21d: number | null,
  rsExcess126d: number | null,
): SepaCheck[] {
  const status = (passed: boolean): CheckStatus => (passed ? 'pass' : 'fail');

  const c1 = last > ma150 && last > ma200;
  const c2 = ma150 > ma200;
  const slope1m = ma2001m ? ((ma200 - ma2001m) / ma2001m) * 100 : 0;
  const slope4m = ma2004m ? ((ma200 - ma2004m) / ma2004m) * 100 : 0;
  const c3 = slope1m > 0;
  const c4 = ma50 > ma150 && ma50 > ma200;
  const c5 = last > ma50;
  const c6 = last >= low52w * 1.3;
  const c7 = last >= high52w * 0.75;

  let c8Status: SepaCheck['status'];
  if (rsExcess126d === null) c8Status = 'unknown';
  else if (rsExcess126d >= 0) c8Status = 'pass';
  else if (rsExcess126d >= -5) c8Status = 'unknown';
  else c8Status = 'fail';

  let extendedNote = '';
  if (c5) {
    const ext = (last / ma50 - 1) * 100;
    if (ext >= 25) extendedNote = ` ⚠ extended +${fmt(ext, 1)}%`;
  }

  return [
    {
      label: '价 > 150MA 且 > 200MA',
      status: status(c1),
      val: `价 $${fmt(last, 2)} vs 150MA $${fmt(ma150, 2)} / 200MA $${fmt(ma200, 2)}`,
    },
    {
      label: '150MA > 200MA',
      status: status(c2),
      val: c2 ? `${fmt(ma150, 2)} > ${fmt(ma200, 2)}` : `${fmt(ma150, 2)} ≤ ${fmt(ma200, 2)}`,
    },
    {
      label: '200MA 上行 ≥ 1 月',
      status: status(c3),
      val: `1月斜率 ${signed(slope1m, 2)}%, 4月 ${signed(slope4m, 2)}%`,
    },
    {
      label: '50MA > 150MA 且 > 200MA',
      status: status(c4),
      val: c4
        ? `${fmt(ma50, 2)} > ${fmt(ma150, 2)} > ${fmt(ma200, 2)}`
        : `${fmt(ma50, 2)} / ${fmt(ma150, 2)} / ${fmt(ma200, 2)}`,
    },
    {
      label: '价 > 50MA',
      status: status(c5),
      val: `价 $${fmt(last, 2)} vs 50MA $${fmt(ma50, 2)} (${signed((last / ma50 - 1) * 100, 1)}%)${extendedNote}`,
    },
    {
      label: '距 52w 低 ≥ +30%',
      status: status(c6),
      val: `+${fmt((last / low52w - 1) * 100, 0)}% (低 $${fmt(low52w, 2)})`,
    },
    {
      label: '距 52w 高 ≤ 25% 内',
      status: status(c7),
      val: `${signed((last / high52w - 1) * 100, 2)}% (高 $${fmt(high52w, 2)})`,
    },
    {
      label: 'RS > 70 分位 (vs SPY)',
      status: c8Status,
      val:
        rsExcess126d !== null
          ? `21天 ${signed(rsExcess21d ?? 0, 1)} pp, 126天 ${signed(rsExcess126d, 1)} pp`
          : '无 SPY 数据，未计算',
    },
  ];
}

export function autoVerdict(checks: SepaCheck[], last: number, ma50: number): SepaVerdict {
  const fails = checks.filter((c) => c.status === 'fail');
  if (fails.length) {
    return {
      tier: 'pass',
      label: '🚫 PASS',
      color: '#ef5350',
      reason:
        `趋势模板 8 条中 ${fails.length} 条 Fail（` +
        fails
          .slice(0, 3)
          .map((c) => c.label)
          .join('、') +
        (fails.length > 3 ? '…' : '') +
        '）→ 不满足 SEPA 入场条件。',
    };
  }
  const extPct = (last / ma50 - 1) * 100;
  if (extPct >= 25) {
    return {
      tier: 'watch',
      label: '👀 WATCH LIST',
      color: '#ffc107',
      reason:
        `8 条全过，但距 50MA +${fmt(extPct, 1)}% 已 extended（>25% 警戒）。` +
        '当下不是合法入场点，等回调至 50MA 附近形成新整理平台再观察。',
    };
  }
  return {
    tier: 'watch',
    label: '👀 WATCH LIST',
    color: '#ffc107',
    reason:
      '8 条全过，自动检测未发现可买的整理形态（VCP / 杯柄 / 平台 / 旗形需人工目视确认）。' +
      '若价位在 pivot ~ pivot+5% 买入区且当日成交量 ≥ 1.5×20MA 量，则可升为 Strong Buy。',
  };
}

function computeEntryPlan(raw: NonNullable<SepaContext['entry_plan']>): SepaEntryPlan {
  const pivot = Number(raw.pivot);
  const stop = raw.stop ? Number(raw.stop) : pyRound(pivot * 0.93, 2);
  const t1Pct = Number(raw.target1_pct ?? 8);
  const t2Pct = Number(raw.target2_pct ?? 15);
  const buyZoneHigh = pyRound(pivot * 1.05, 2);
  const target1 = pyRound(pivot * (1 + t1Pct / 100), 2);
  const target2 = pyRound(pivot * (1 + t2Pct / 100), 2);
  const stopPct = (stop / pivot - 1) * 100;
  const rr = pivot > stop ? (target2 - pivot) / (pivot - stop) : 0;
  return {
    pivot,
    buy_zone_high: buyZoneHigh,
    stop,
    stop_pct: stopPct,
    target1,
    target1_pct: t1Pct,
    target2,
    target2_pct: t2Pct,
    rr,
    rr_ok: rr >= 2,
    rr_great: rr >= 3,
    note: raw.note ?? '',
    hypothetical: Boolean(raw.hypothetical),
  };
}

export function buildSepa(input: SepaInput): { built: SepaBuilt; meta: SepaMeta } {
  const symbol = input.symbol;
  if (!symbol) throw new ClientError('sepa: input.symbol is required');
  const name = input.name || symbol;
  const context = input.context ?? {};
  const earningsDates = context.earnings_dates ?? [];

  const k = coerceKlines(input.kline, 'kline');
  const { timesTs, dates, opens, highs, lows, closes, vols } = k;

  const ma50Arr = sma(closes, 50);
  const ma150Arr = sma(closes, 150);
  const ma200Arr = sma(closes, 200);
  const vol20Arr = sma(vols, 20);

  const last = closes.at(-1)!;
  const prev = closes.length >= 2 ? closes.at(-2)! : last;
  const chgPct = prev ? (last / prev - 1) * 100 : 0;

  const ma50Now = ma50Arr.at(-1) || last;
  const ma150Now = ma150Arr.at(-1) || last;
  const ma200Now = ma200Arr.at(-1) || last;

  const maAgo = (arr: (number | null)[], days: number): number | null => {
    const idx = arr.length - 1 - days;
    return idx >= 0 && idx < arr.length ? arr[idx] : null;
  };
  const ma2001m = maAgo(ma200Arr, 21);
  const ma2004m = maAgo(ma200Arr, 84);

  const window = Math.min(252, highs.length);
  const high52w = Math.max(...highs.slice(-window));
  const low52w = Math.min(...lows.slice(-window));

  const candles = toCandles(k);
  const volumes: ColoredPoint[] = timesTs.map((t, i) => {
    let color = closes[i] >= opens[i] ? '#26a69a' : '#ef5350';
    const v20 = vol20Arr[i];
    if (v20 !== null && vols[i] >= 1.5 * v20) color = '#ff5722';
    return { time: t, value: vols[i], color };
  });

  const volRatio: ColoredPoint[] = [];
  for (let i = 0; i < timesTs.length; i++) {
    const v20 = vol20Arr[i];
    if (!v20) continue;
    const r = vols[i] / v20;
    let color = '#42a5f5';
    if (r >= 1.5) color = '#ff5722';
    else if (r < 0.5) color = '#9e9e9e';
    volRatio.push({ time: timesTs[i], value: pyRound(r, 3), color });
  }

  let rs21: ReturnType<typeof rsSeries> = [];
  let rs63: ReturnType<typeof rsSeries> = [];
  let rs126: ReturnType<typeof rsSeries> = [];
  let spyExcess21d: number | null = null;
  let spyExcess126d: number | null = null;
  if (input.spy_kline && input.spy_kline.length) {
    const spy = coerceKlines(input.spy_kline, 'spy_kline');
    const spyMap = new Map<number, number>();
    spy.timesTs.forEach((t, i) => spyMap.set(t, spy.closes[i]));
    rs21 = rsSeries(closes, timesTs, spyMap, 21);
    rs63 = rsSeries(closes, timesTs, spyMap, 63);
    rs126 = rsSeries(closes, timesTs, spyMap, 126);
    if (rs21.length) spyExcess21d = rs21.at(-1)!.value;
    if (rs126.length) spyExcess126d = rs126.at(-1)!.value;
  }

  const markers = detectMarkers(
    timesTs,
    dates,
    opens,
    highs,
    closes,
    vols,
    vol20Arr,
    ma50Arr,
    ma200Arr,
    high52w,
    earningsDates,
  );

  const checks = computeChecks(
    last,
    ma50Now,
    ma150Now,
    ma200Now,
    ma2001m,
    ma2004m,
    high52w,
    low52w,
    spyExcess21d,
    spyExcess126d,
  );

  const verdict = context.verdict ?? autoVerdict(checks, last, ma50Now);

  const vpCfg = context.volume_profile ?? {};
  const vp = computeVolumeProfile(
    highs,
    lows,
    vols,
    Math.trunc(vpCfg.lookback_days ?? 120),
    Math.trunc(vpCfg.bins ?? 30),
  );

  const rawZones = context.support_zones;
  const supportZones =
    rawZones == null && (context.auto_support_zones ?? true)
      ? defaultSupportZones(closes, ma50Now, ma150Now, ma200Now, vp)
      : normalizeSupportZones(rawZones);

  const entryPlan = context.entry_plan?.pivot ? computeEntryPlan(context.entry_plan) : null;

  const chart: SepaChartData = {
    candles,
    ma50: lineData(timesTs, ma50Arr),
    ma150: lineData(timesTs, ma150Arr),
    ma200: lineData(timesTs, ma200Arr),
    volumes,
    volRatio,
    rs21,
    rs63,
    rs126,
    markers,
    high52w,
    low52w,
    extendedLine: ma50Now ? ma50Now * 1.25 : 0,
    entryPlan,
    supportZones,
    volumeProfile: vp,
  };

  const stage: { k: string; v: string }[] = [];
  for (const [kk, vv] of [
    ['阶段', context.stage],
    ['阶段备注', context.stage_note],
    ['Base 数', context.base_count],
    ['形态', context.pattern],
  ] as const) {
    if (vv) stage.push({ k: kk, v: vv });
  }

  const shares = input.position?.shares;
  const cost = input.position?.cost;
  const position =
    shares && cost
      ? { shares, cost, unrealized: (last - cost) * shares, unrealizedPct: (last / cost - 1) * 100 }
      : null;

  const built: SepaBuilt = {
    kind: 'sepa',
    chart,
    sidebar: {
      symbol,
      name,
      asOf: input.as_of_date || input.kline.at(-1)?.time || dates.at(-1)!,
      last,
      chgPct,
      verdict,
      checks,
      stage,
      keyValues: {
        high52w,
        h52Pct: (last / high52w - 1) * 100,
        low52w,
        l52Pct: (last / low52w - 1) * 100,
        ma50: ma50Now,
        ma150: ma150Now,
        ma200: ma200Now,
        ma50Pct: (last / ma50Now - 1) * 100,
        ma200Pct: (last / ma200Now - 1) * 100,
        rs21d: spyExcess21d,
        rs126d: spyExcess126d,
      },
      position,
      ma50Now,
      news: input.news ?? [],
    },
  };

  const meta: SepaMeta = {
    verdict_tier: verdict.tier,
    fails: checks.filter((c) => c.status === 'fail').length,
    passes: checks.filter((c) => c.status === 'pass').length,
    bars: timesTs.length,
  };

  return { built, meta };
}
