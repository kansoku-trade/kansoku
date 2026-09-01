export interface DemoCanvasStat {
  label: string;
  value: string;
  delta?: string;
  tone?: 'up' | 'down';
}

export interface DemoCanvasMetric {
  key: string;
  label: string;
  suffix?: string;
}

export interface DemoCanvasCompareRow {
  symbol: string;
  label: string;
  values: Record<string, number>;
}

export interface DemoCanvasBar {
  x: string;
  y: number;
}

export interface DemoCanvasScenario {
  label: string;
  probability: number;
  trigger: string;
  note?: string;
  tone?: 'up' | 'down';
}

export interface DemoCanvasEvent {
  at: string;
  label: string;
  detail?: string;
  price?: number;
  tone?: 'up' | 'down';
  current?: boolean;
}

export interface DemoCanvas {
  slug: string;
  title: string;
  caption: string;
  conclusion: string;
  stats: DemoCanvasStat[];
  compareMetrics: DemoCanvasMetric[];
  compare: DemoCanvasCompareRow[];
  flow?: DemoCanvasBar[];
  scenarios?: DemoCanvasScenario[];
  timeline?: DemoCanvasEvent[];
  coverage: { label: string; status: 'ok' | 'missing'; note?: string }[];
  source: { from: string; at: string };
}

export const DEMO_CANVASES: DemoCanvas[] = [
  {
    slug: 'mu-vs-smh',
    title: 'MU vs 板块强弱',
    caption: 'Longbridge · 08-28 收盘 · 5 分钟 K 线',
    conclusion: 'MU 跌 2.4%，同期板块只跌 0.8%，是个股自己的事。',
    stats: [
      { label: 'MU 收盘', value: '61.20', delta: '-2.4%', tone: 'down' },
      { label: '相对板块', value: '-1.6%', tone: 'down' },
      { label: '成交额', value: '19.6B' },
    ],
    compareMetrics: [{ key: 'close', label: '收盘涨跌', suffix: '%' }],
    compare: [
      { symbol: 'MU', label: '个股', values: { close: -2.4 } },
      { symbol: 'SMH', label: '板块', values: { close: -0.8 } },
    ],
    coverage: [
      { label: '收盘价 / 涨跌', status: 'ok' },
      { label: '期权持仓', status: 'missing', note: '该账户未授权' },
    ],
    source: { from: 'Longbridge', at: '2026-08-28 16:00 ET' },
  },
  {
    slug: 'memory-flow',
    title: '存储链资金',
    caption: 'Longbridge · 08-28 资金流 · 收盘口径',
    conclusion: '钱还在存储里：MU / SNDK 净流入，GPU 当天在吐。',
    stats: [
      { label: 'MU 净流入', value: '+31.5', delta: '百万美元', tone: 'up' },
      { label: 'TSM 净流入', value: '+18.2', tone: 'up' },
      { label: 'NVDA 净流出', value: '−9.4', tone: 'down' },
    ],
    compareMetrics: [{ key: 'flow', label: '净流入' }],
    compare: [
      { symbol: 'MU', label: '存储', values: { flow: 31.5 } },
      { symbol: 'TSM', label: '代工', values: { flow: 18.2 } },
      { symbol: 'NVDA', label: 'GPU', values: { flow: -9.4 } },
    ],
    coverage: [
      { label: '资金流', status: 'ok' },
      { label: '盘后成交', status: 'missing', note: '收盘口径，不含夜盘' },
    ],
    source: { from: 'Longbridge', at: '2026-08-28 16:00 ET' },
  },
  {
    slug: 'mu-session',
    title: 'MU 当日对照',
    caption: 'Longbridge · 08-28 收盘 · 5 分钟 K 线 / 资金流',
    conclusion: 'MU 弱于板块，但钱还在存储里，当天不当追空。',
    stats: [
      { label: 'MU 收盘', value: '61.20', delta: '-2.4%', tone: 'down' },
      { label: '相对 SMH', value: '-1.6%', tone: 'down' },
      { label: 'MU 净流入', value: '+31.5', delta: '百万美元', tone: 'up' },
      { label: 'NVDA 净流出', value: '−9.4', tone: 'down' },
    ],
    compareMetrics: [
      { key: 'change', label: '涨跌', suffix: '%' },
      { key: 'flow', label: '净流入' },
      { key: 'rel', label: '相对板块', suffix: '%' },
    ],
    compare: [
      { symbol: 'MU', label: '美光', values: { change: -2.4, flow: 31.5, rel: -1.6 } },
      { symbol: 'SMH', label: '板块', values: { change: -0.8, flow: 8.2, rel: 0 } },
      { symbol: 'TSM', label: '台积电', values: { change: -0.4, flow: 18.2, rel: 0.4 } },
      { symbol: 'NVDA', label: '英伟达', values: { change: -1.1, flow: -9.4, rel: -0.3 } },
    ],
    flow: [
      { x: '09:30', y: 4.2 },
      { x: '10:30', y: 8.1 },
      { x: '11:30', y: -2.6 },
      { x: '13:00', y: 6.8 },
      { x: '14:00', y: 9.4 },
      { x: '15:00', y: 5.6 },
    ],
    scenarios: [
      {
        label: 'Base 基准',
        probability: 55,
        trigger: '在 59—62 之间反复',
        note: '不动。价格弱、资金不弱，两边对不上就先看。',
      },
      {
        label: 'Bear 悲观',
        probability: 30,
        trigger: '失守 58.8 且当日不收回',
        tone: 'down',
        note: '资金转负再谈追空，现在还不是。',
      },
      {
        label: 'Bull 乐观',
        probability: 15,
        trigger: '收盘跌幅收到 SMH 以内',
        tone: 'up',
        note: '看到了再说，不当天上车。',
      },
    ],
    timeline: [
      { at: '09:35', label: '低开，相对 SMH 已落后 0.6pp', price: 61.8, tone: 'down' },
      { at: '11:20', label: '盘中回补一半，资金仍为正', price: 61.05 },
      { at: '14:10', label: 'MU 净流入转加速，价格没跟上', price: 60.9, tone: 'up' },
      { at: '16:00', label: '收 61.20，弱于板块 1.6pp', price: 61.2, tone: 'down', current: true },
    ],
    coverage: [
      { label: '收盘价 / 涨跌', status: 'ok' },
      { label: '资金流', status: 'ok', note: '收盘口径' },
      { label: '期权持仓', status: 'missing', note: '该账户未授权' },
      { label: '盘后成交', status: 'missing', note: '不含夜盘' },
    ],
    source: { from: 'Longbridge', at: '2026-08-28 16:00 ET' },
  },
];

export const signedText = (value: number, suffix = ''): string =>
  `${value > 0 ? '+' : ''}${value}${suffix}`;

export const maxAbs = (values: number[]): number =>
  values.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);

export const barShare = (value: number, peak: number): number =>
  peak === 0 ? 0 : Math.abs(value) / peak;
