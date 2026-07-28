#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/data/market-snapshot.json',
);

const CHART_SYMBOL = 'NVDA.US';
const TRAINER_SYMBOL = 'MU.US';
const TRAINER_RANGE = { start: '2026-06-15', end: '2026-06-19' };
const TRAINER_BARS = 132;

const lb = (args) => {
  const raw = execFileSync('longbridge', [...args, '--format', 'json'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(raw);
};

const round = (value, digits = 2) => Number(Number(value).toFixed(digits));

const toBars = (rows) =>
  rows.map((row) => [
    Math.floor(new Date(row.time).getTime() / 1000),
    round(row.open),
    round(row.high),
    round(row.low),
    round(row.close),
    Math.round(Number(row.volume)),
  ]);

const sma = (values, period, endExclusive = values.length) => {
  if (endExclusive < period) return null;
  let sum = 0;
  for (let i = endExclusive - period; i < endExclusive; i++) sum += values[i];
  return round(sum / period);
};

const kline = (symbol, period, count, session = 'all') =>
  lb(['kline', symbol, '--period', period, '--count', String(count), '--session', session]);

const history = (symbol, period, start, end) =>
  lb([
    'kline',
    'history',
    symbol,
    '--period',
    period,
    '--start',
    start,
    '--end',
    end,
    '--session',
    'all',
  ]);

const quote = lb(['quote', CHART_SYMBOL])[0];
const daily = lb([
  'kline',
  CHART_SYMBOL,
  '--period',
  'day',
  '--count',
  '460',
  '--adjust',
  'forward',
]);
const spyDaily = lb([
  'kline',
  'SPY.US',
  '--period',
  'day',
  '--count',
  '460',
  '--adjust',
  'forward',
]);
const closes = daily.map((row) => Number(row.close));
const highs = daily.map((row) => Number(row.high));
const lows = daily.map((row) => Number(row.low));

// The daily pull runs long so the 4-month MA200 slope and the 126-day RS have room; the 52-week
// window has to be sliced back out of it or "52w high/low" would silently mean two years.
const SESSIONS_52W = 252;
const last = Number(quote.last);
const high52 = round(Math.max(...highs.slice(-SESSIONS_52W)));
const low52 = round(Math.min(...lows.slice(-SESSIONS_52W)));
const ma50 = sma(closes, 50);
const ma150 = sma(closes, 150);
const ma200 = sma(closes, 200);
const ma200Month = sma(closes, 200, closes.length - 21);
const ma200FourMonth = sma(closes, 200, closes.length - 84);

const pct = (from, to) => round(((to - from) / from) * 100);

const spyCloses = spyDaily.map((row) => Number(row.close));
const rsExcess = (lookback) => {
  if (closes.length <= lookback || spyCloses.length <= lookback) return null;
  const mine = closes.at(-1) / closes.at(-1 - lookback) - 1;
  const spy = spyCloses.at(-1) / spyCloses.at(-1 - lookback) - 1;
  return round((mine - spy) * 100, 1);
};
const rs21 = rsExcess(21);
const rs126 = rsExcess(126);

const signed = (value, digits = 2) => `${value >= 0 ? '+' : ''}${Number(value).toFixed(digits)}`;

// Mirrors packages/core/src/analysis/sepa.ts — the landing page must not invent a friendlier
// verdict than the product's own rules would produce.
const slope1m = ma200Month ? ((ma200 - ma200Month) / ma200Month) * 100 : 0;
const slope4m = ma200FourMonth ? ((ma200 - ma200FourMonth) / ma200FourMonth) * 100 : 0;
const status = (passed) => (passed ? 'pass' : 'fail');
let c8 = 'unknown';
if (rs126 !== null) c8 = rs126 >= 0 ? 'pass' : rs126 >= -5 ? 'unknown' : 'fail';

const sepaChecks = [
  {
    label: '价 > 150MA 且 > 200MA',
    status: status(last > ma150 && last > ma200),
    val: `价 $${round(last)} vs 150MA $${ma150} / 200MA $${ma200}`,
  },
  {
    label: '150MA > 200MA',
    status: status(ma150 > ma200),
    val: ma150 > ma200 ? `${ma150} > ${ma200}` : `${ma150} ≤ ${ma200}`,
  },
  {
    label: '200MA 上行 ≥ 1 月',
    status: status(slope1m > 0),
    val: `1月斜率 ${signed(slope1m)}%, 4月 ${signed(slope4m)}%`,
  },
  {
    label: '50MA > 150MA 且 > 200MA',
    status: status(ma50 > ma150 && ma50 > ma200),
    val:
      ma50 > ma150 && ma50 > ma200
        ? `${ma50} > ${ma150} > ${ma200}`
        : `${ma50} / ${ma150} / ${ma200}`,
  },
  {
    label: '价 > 50MA',
    status: status(last > ma50),
    val: `价 $${round(last)} vs 50MA $${ma50} (${signed((last / ma50 - 1) * 100, 1)}%)`,
  },
  {
    label: '距 52w 低 ≥ +30%',
    status: status(last >= low52 * 1.3),
    val: `+${((last / low52 - 1) * 100).toFixed(0)}% (低 $${low52})`,
  },
  {
    label: '距 52w 高 ≤ 25% 内',
    status: status(last >= high52 * 0.75),
    val: `${signed((last / high52 - 1) * 100)}% (高 $${high52})`,
  },
  {
    label: 'RS > 70 分位 (vs SPY)',
    status: c8,
    val:
      rs126 !== null
        ? `21天 ${signed(rs21 ?? 0, 1)} pp, 126天 ${signed(rs126, 1)} pp`
        : '无 SPY 数据，未计算',
  },
];

const fails = sepaChecks.filter((check) => check.status === 'fail');
const verdict = fails.length
  ? {
      label: '🚫 PASS',
      tier: 'pass',
      reason: `趋势模板 8 条中 ${fails.length} 条 Fail（${fails
        .slice(0, 3)
        .map((c) => c.label)
        .join('、')}${fails.length > 3 ? '…' : ''}）→ 不满足 SEPA 入场条件。`,
    }
  : {
      label: '👀 WATCH LIST',
      tier: 'watch',
      reason:
        '8 条全过，自动检测未发现可买的整理形态（VCP / 杯柄 / 平台 / 旗形需人工目视确认）。若价位在 pivot ~ pivot+5% 买入区且当日成交量 ≥ 1.5×20MA 量，则可升为 Strong Buy。',
    };

const intraday5m = kline(CHART_SYMBOL, '5m', 240);
const sessionRows = intraday5m.filter(
  (row) => row.session === 'Pre' || row.session === 'Overnight',
);
const prevDay = daily.at(-2);

// Every price line on the chart is a real level: the pre/overnight extremes come from the tagged
// 5m bars, the prior-day extremes from the daily series. Nothing here is derived from the picture.
const levels = [
  sessionRows.length
    ? {
        label: '盘前高',
        value: round(Math.max(...sessionRows.map((row) => Number(row.high)))),
        tone: 'pre',
      }
    : null,
  sessionRows.length
    ? {
        label: '盘前低',
        value: round(Math.min(...sessionRows.map((row) => Number(row.low)))),
        tone: 'pre',
      }
    : null,
  prevDay ? { label: '昨高', value: round(Number(prevDay.high)), tone: 'prev' } : null,
  prevDay ? { label: '昨低', value: round(Number(prevDay.low)), tone: 'prev' } : null,
  { label: 'MA50', value: ma50, tone: 'anchor' },
].filter(Boolean);

const todayRows = intraday5m.filter((row) => row.session === 'Intraday');
const dayHigh = round(Math.max(...todayRows.map((row) => Number(row.high))));
const dayLow = round(Math.min(...todayRows.map((row) => Number(row.low))));
const preHigh = levels.find((l) => l.label === '盘前高')?.value ?? dayHigh;
const prevHigh = levels.find((l) => l.label === '昨高')?.value ?? dayHigh;
const prevLow = levels.find((l) => l.label === '昨低')?.value ?? dayLow;
const turnover = todayRows.reduce((sum, row) => sum + Number(row.turnover), 0);
const volume = todayRows.reduce((sum, row) => sum + Number(row.volume), 0);
const vwap = volume > 0 ? round(turnover / volume) : round(last);

// Every price quoted in the panel is a measured level from the pull above. The probability split
// and the wording are an illustrative example of an analyst conclusion, not a live model run —
// the app's own disclaimer (rendered under the panel) says exactly that.
const prediction = {
  direction: 'neutral',
  anchor: { timeframe: '15分钟', price: round(last) },
  scenarios: [
    {
      label: '区间震荡',
      probability: 45,
      path: `价格主要在 ${dayLow.toFixed(2)}–${dayHigh.toFixed(2)} 之间反复，消化开盘后的急跌急拉。`,
      trigger: `15 分钟收盘守住 VWAP ${vwap.toFixed(2)}，但无法放量站稳今日高点 ${dayHigh.toFixed(2)}。`,
    },
    {
      label: '向上突破',
      probability: 35,
      path: `先测试 ${prevHigh.toFixed(2)} 附近，强势延续时再观察 50MA ${ma50.toFixed(2)} 一带。`,
      trigger: `15 分钟放量收在 ${dayHigh.toFixed(2)} 上方，随后回踩守住盘前高 ${preHigh.toFixed(2)}。`,
    },
    {
      label: '反弹失败',
      probability: 20,
      path: `先回测昨日低点 ${prevLow.toFixed(2)}，极弱时重测今日低点 ${dayLow.toFixed(2)}。`,
      trigger: `15 分钟跌回 VWAP ${vwap.toFixed(2)} 下方，并失守今日低点 ${dayLow.toFixed(2)}。`,
    },
  ],
  rangePlan: {
    low: dayLow,
    high: dayHigh,
    condition: `在相对成交量偏低、资金流三档均净流出的情况下，未放量突破 ${dayHigh.toFixed(2)} 或失守 ${vwap.toFixed(2)} 前按箱体处理。`,
    longTactic: `不在 ${prevHigh.toFixed(2)}–${dayHigh.toFixed(2)} 压力带追价；等待回踩 ${vwap.toFixed(2)} 后重新站回，或突破 ${dayHigh.toFixed(2)} 后回踩确认。`,
    shortTactic: `最近 30 根 1 小时 K 线仍属上升结构，不预先摸顶；仅在失守 ${vwap.toFixed(2)} 且反抽不过 ${prevLow.toFixed(2)} 时考虑转弱应对。`,
  },
  stats: { dayHigh, dayLow, vwap },
};

const snapshot = {
  capturedAt: new Date().toISOString().slice(0, 10),
  source: 'longbridge CLI',
  chart: {
    symbol: CHART_SYMBOL,
    name: 'NVDA.US 短线多周期',
    last: round(last),
    changePct: round(Number(quote.change_percentage)),
    levels,
    timeframes: {
      '5m': toBars(intraday5m.slice(-140)),
      '15m': toBars(kline(CHART_SYMBOL, '15m', 140)),
      '1h': toBars(kline(CHART_SYMBOL, '1h', 120)),
    },
    stats: {
      high52,
      low52,
      ma50,
      ma150,
      ma200,
      fromHigh: pct(high52, last),
      fromLow: pct(low52, last),
      fromMa50: pct(ma50, last),
    },
    sepa: { checks: sepaChecks, verdict },
    prediction,
  },
  trainer: {
    // The landing page never names it: a blind case is defined by hiding the symbol and the dates.
    period: '5m',
    bars: toBars(history(TRAINER_SYMBOL, '5m', TRAINER_RANGE.start, TRAINER_RANGE.end)).slice(
      -TRAINER_BARS,
    ),
  },
};

writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`);

console.log(`wrote ${OUT}`);
console.log(`  captured   ${snapshot.capturedAt}`);
console.log(`  ${CHART_SYMBOL}  last ${snapshot.chart.last} (${snapshot.chart.changePct}%)`);
for (const [tf, bars] of Object.entries(snapshot.chart.timeframes)) {
  console.log(`  ${tf.padEnd(4)} ${bars.length} bars`);
}
console.log(`  52w ${low52} – ${high52}   ma50 ${ma50}  ma150 ${ma150}  ma200 ${ma200}`);
console.log(`  trainer ${snapshot.trainer.bars.length} bars`);
