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

export interface DemoCanvasLevel {
  price: number;
  label: string;
  kind: 'resist' | 'support' | 'current';
}

export interface DemoCanvasCheck {
  label: string;
  status: 'pass' | 'fail' | 'unknown';
  note?: string;
}

export interface DemoCanvas {
  slug: string;
  title: string;
  caption: string;
  conclusion: string;
  stats: DemoCanvasStat[];
  compareMetrics: DemoCanvasMetric[];
  compare: DemoCanvasCompareRow[];
  flowTitle?: string;
  flow?: DemoCanvasBar[];
  levels?: DemoCanvasLevel[];
  checklist?: DemoCanvasCheck[];
  scenarios?: DemoCanvasScenario[];
  timeline?: DemoCanvasEvent[];
  coverage: { label: string; status: 'ok' | 'missing'; note?: string }[];
  source: { from: string; at: string };
}

export const DEMO_CANVASES: DemoCanvas[] = [
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
    flowTitle: '分时资金',
    flow: [
      { x: '09:30', y: 4.2 },
      { x: '10:30', y: 8.1 },
      { x: '11:30', y: -2.6 },
      { x: '13:00', y: 6.8 },
      { x: '14:00', y: 9.4 },
      { x: '15:00', y: 5.6 },
    ],
    levels: [
      { price: 64.4, label: '8/21 高点，上方第一道压力', kind: 'resist' },
      { price: 62.7, label: '20 日均线', kind: 'resist' },
      { price: 61.2, label: '收盘', kind: 'current' },
      { price: 58.8, label: '8/12 缺口下沿，失守才算破位', kind: 'support' },
      { price: 56.3, label: '50 日均线', kind: 'support' },
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
  {
    slug: 'nvda-earnings-map',
    title: 'NVDA 财报前后地图',
    caption: 'Longbridge · 08-27 盘后财报 · 日线 / 资金流 / 期权定价',
    conclusion: '数字全超预期，股价却不动：期权定价的 ±6.8% 已经把好消息花完了。',
    stats: [
      { label: '财报后开盘', value: '181.40', delta: '+0.3%', tone: 'up' },
      { label: '期权定价的预期波动', value: '±6.8%' },
      { label: '实际波动', value: '+0.3%', tone: 'up' },
      { label: '5 日净流入', value: '−42.1', delta: '百万美元', tone: 'down' },
    ],
    compareMetrics: [
      { key: 'd5', label: '5 日涨跌', suffix: '%' },
      { key: 'flow', label: '5 日净流入' },
      { key: 'rel', label: '相对板块', suffix: '%' },
    ],
    compare: [
      { symbol: 'NVDA', label: '英伟达', values: { d5: -1.8, flow: -42.1, rel: -2.9 } },
      { symbol: 'AVGO', label: '博通', values: { d5: 2.4, flow: 27.6, rel: 1.3 } },
      { symbol: 'AMD', label: 'AMD', values: { d5: 0.6, flow: 5.2, rel: -0.5 } },
      { symbol: 'TSM', label: '台积电', values: { d5: 1.9, flow: 18.2, rel: 0.8 } },
      { symbol: 'SMH', label: '板块', values: { d5: 1.1, flow: 12.4, rel: 0 } },
    ],
    flowTitle: '财报前 5 日资金',
    flow: [
      { x: '08-21', y: -6.3 },
      { x: '08-22', y: 3.1 },
      { x: '08-25', y: -12.8 },
      { x: '08-26', y: -9.7 },
      { x: '08-27', y: -16.4 },
    ],
    levels: [
      { price: 195.6, label: '52 周高，上方无套牢盘', kind: 'resist' },
      { price: 186.2, label: '财报前 3 日高点，放量才算突破', kind: 'resist' },
      { price: 181.4, label: '财报后开盘', kind: 'current' },
      { price: 176.5, label: '50 日均线，8 月两次守住', kind: 'support' },
      { price: 168.9, label: '7/31 缺口上沿', kind: 'support' },
    ],
    checklist: [
      { label: '营收超预期且指引上调', status: 'pass', note: '数据中心 +56%' },
      { label: '毛利率没有下滑', status: 'pass', note: '73.1% → 73.4%' },
      { label: '财报前资金为正', status: 'fail', note: '5 日净流出 42.1M' },
      { label: '期权预期波动小于历史均值', status: 'fail', note: '±6.8%，前四季均值 ±5.9%' },
      { label: '中国出口许可影响', status: 'unknown', note: '电话会未给数字' },
    ],
    scenarios: [
      {
        label: 'Base 基准',
        probability: 50,
        trigger: '176.5—186.2 之间来回，等资金转正',
        note: '不加不减。业绩利好已定价，资金没回来前不动手。',
      },
      {
        label: 'Bull 乐观',
        probability: 30,
        trigger: '放量收在 186.2 上方，且当日净流入转正',
        tone: 'up',
        note: '等回踩 186 不破再加，不追突破当天。',
      },
      {
        label: 'Bear 悲观',
        probability: 20,
        trigger: '收盘失守 176.5 且次日不收回',
        tone: 'down',
        note: '按 D 线处理：减到底仓，理由写进复盘。',
      },
    ],
    timeline: [
      { at: '08-25', label: '财报前两日，净流出 12.8M', price: 184.5, tone: 'down' },
      { at: '08-27 16:05', label: '财报：营收 / 指引双超', price: 180.9 },
      { at: '08-27 16:40', label: '盘后一度 +4.2%，电话会后回吐', price: 188.5, tone: 'up' },
      { at: '08-28 09:30', label: '开盘 181.40，仅 +0.3%', price: 181.4, current: true },
    ],
    coverage: [
      { label: '财报数字 / 指引', status: 'ok', note: 'SEC 8-K' },
      { label: '资金流', status: 'ok', note: '收盘口径' },
      { label: '期权定价的预期波动', status: 'ok', note: 'CBOE 延迟 15 分钟' },
      { label: '逐合约期权报价', status: 'missing', note: '该账户未授权' },
    ],
    source: { from: 'Longbridge / SEC / CBOE', at: '2026-08-28 09:45 ET' },
  },
  {
    slug: 'memory-chain-rotation',
    title: '存储链轮动',
    caption: 'Longbridge · 08-28 收盘 · 5 日资金流 / 相对强弱',
    conclusion: '钱从 GPU 挪到存储，但只挪到了 MU 和 SNDK，硬盘那两家没份。',
    stats: [
      { label: 'MU 5 日净流入', value: '+96.3', delta: '百万美元', tone: 'up' },
      { label: 'SNDK 5 日净流入', value: '+41.7', tone: 'up' },
      { label: 'NVDA 5 日净流出', value: '−42.1', tone: 'down' },
      { label: '存储 vs GPU 强弱', value: '+5.2%', tone: 'up' },
    ],
    compareMetrics: [
      { key: 'd5', label: '5 日涨跌', suffix: '%' },
      { key: 'flow', label: '5 日净流入' },
      { key: 'rel', label: '相对 SMH', suffix: '%' },
      { key: 'rs', label: '20 日强弱', suffix: '%' },
    ],
    compare: [
      { symbol: 'MU', label: '美光 · DRAM', values: { d5: 3.4, flow: 96.3, rel: 2.3, rs: 8.1 } },
      { symbol: 'SNDK', label: '闪迪 · NAND', values: { d5: 5.1, flow: 41.7, rel: 4, rs: 11.6 } },
      {
        symbol: 'WDC',
        label: '西数 · 硬盘',
        values: { d5: -0.7, flow: -3.8, rel: -1.8, rs: -2.2 },
      },
      {
        symbol: 'STX',
        label: '希捷 · 硬盘',
        values: { d5: -1.2, flow: -6.1, rel: -2.3, rs: -3.5 },
      },
      {
        symbol: 'NVDA',
        label: '英伟达 · GPU',
        values: { d5: -1.8, flow: -42.1, rel: -2.9, rs: -4.4 },
      },
      { symbol: 'SMH', label: '板块', values: { d5: 1.1, flow: 12.4, rel: 0, rs: 0 } },
    ],
    flowTitle: '存储四家 5 日净流入合计',
    flow: [
      { x: '08-22', y: 11.2 },
      { x: '08-25', y: 24.6 },
      { x: '08-26', y: 31.9 },
      { x: '08-27', y: 18.3 },
      { x: '08-28', y: 42.1 },
    ],
    checklist: [
      { label: '资金连续 3 日以上流入', status: 'pass', note: '5 日全部为正' },
      { label: '不止一只在涨', status: 'pass', note: 'MU + SNDK' },
      { label: '硬盘也跟', status: 'fail', note: 'WDC / STX 反向' },
      { label: '韩国存储先动', status: 'pass', note: '海力士周内 +6.8%' },
      { label: '有事件驱动', status: 'unknown', note: 'DRAM 合约价传闻，未见报价单' },
    ],
    scenarios: [
      {
        label: 'Base 基准',
        probability: 45,
        trigger: 'MU / SNDK 继续走强，硬盘持续落后',
        note: '轮动只在 DRAM / NAND，别把硬盘当补涨。',
      },
      {
        label: 'Bull 乐观',
        probability: 30,
        trigger: 'WDC 放量转正、板块资金同步转正',
        tone: 'up',
        note: '整条链都动了再考虑加第二只。',
      },
      {
        label: 'Bear 悲观',
        probability: 25,
        trigger: 'MU 单日净流出超 30M 且失守 58.8',
        tone: 'down',
        note: '轮动结束的信号，同时看 NVDA 是否回流。',
      },
    ],
    timeline: [
      { at: '08-22', label: '海力士领涨，MU 盘前跟', price: 58.4, tone: 'up' },
      { at: '08-25', label: 'NVDA 首日大额净流出', price: 59.6 },
      { at: '08-26', label: 'SNDK 突破 8 月高点', price: 60.8, tone: 'up' },
      {
        at: '08-28',
        label: 'MU 跌 2.4% 但资金仍正，链内分化',
        price: 61.2,
        tone: 'down',
        current: true,
      },
    ],
    coverage: [
      { label: '资金流 · 5 日', status: 'ok', note: '收盘口径' },
      { label: '韩国存储', status: 'ok', note: 'KRX 收盘' },
      { label: 'DRAM 合约价', status: 'missing', note: '无授权数据源' },
      { label: '期权持仓', status: 'missing', note: '该账户未授权' },
    ],
    source: { from: 'Longbridge / KRX', at: '2026-08-28 16:00 ET' },
  },
  {
    slug: 'position-review',
    title: '持仓周度体检',
    caption: 'Longbridge 持仓 · 08-28 收盘 · 卖出触发器逐条核对',
    conclusion: '四只里只有 AMD 踩到卖出线；其余持有，止损全部上移到成本以上。',
    stats: [
      { label: '持仓市值', value: '184.2K', delta: '本周 +1.9%', tone: 'up' },
      { label: '浮盈', value: '+23.6K', tone: 'up' },
      { label: '离最近止损', value: '3.1%', delta: 'AMD' },
      { label: '现金比例', value: '22%' },
    ],
    compareMetrics: [
      { key: 'pnl', label: '盈亏', suffix: '%' },
      { key: 'stop', label: '离止损', suffix: '%' },
      { key: 'rs', label: '20 日强弱', suffix: '%' },
    ],
    compare: [
      { symbol: 'NVDA', label: '成本 162.3', values: { pnl: 11.8, stop: 8.4, rs: -4.4 } },
      { symbol: 'MU', label: '成本 54.1', values: { pnl: 13.1, stop: 6.2, rs: 8.1 } },
      { symbol: 'TSM', label: '成本 218.0', values: { pnl: 9.6, stop: 7.7, rs: 2.9 } },
      { symbol: 'AMD', label: '成本 171.5', values: { pnl: -3.2, stop: 3.1, rs: -6.7 } },
    ],
    checklist: [
      { label: 'A · 收盘跌破 20 日均线两天', status: 'fail', note: 'AMD 已连跌两天' },
      { label: 'B · 放量长阴吞没前三日', status: 'pass', note: '四只都没有' },
      { label: 'C · 相对板块连续落后一周', status: 'fail', note: 'AMD −6.7%' },
      { label: 'D · 浮盈回吐超过一半', status: 'pass', note: 'NVDA 距最高回吐 38%' },
      { label: '周期顶部清单 11 项', status: 'unknown', note: '命中 3 项，阈值 5' },
    ],
    scenarios: [
      {
        label: 'Base 基准',
        probability: 60,
        trigger: 'AMD 减半，其余止损上移到成本上方',
        note: '按规则来，不因为 AMD 亏着就多等一天。',
      },
      {
        label: 'Bull 乐观',
        probability: 25,
        trigger: 'AMD 次日收回 20 日均线',
        tone: 'up',
        note: '只减半不清仓，留下来的部分按 B 线守。',
      },
      {
        label: 'Bear 悲观',
        probability: 15,
        trigger: '板块资金转负且 NVDA 失守 176.5',
        tone: 'down',
        note: '整体减到 50% 仓位，清单第 4、7 项会同时命中。',
      },
    ],
    timeline: [
      { at: '08-25', label: 'AMD 跌破 20 日均线第一天', price: 168.9, tone: 'down' },
      { at: '08-26', label: 'AMD 第二天没收回，触发 A 线', price: 167.2, tone: 'down' },
      { at: '08-27', label: 'NVDA 财报后止损上移到 176.5', price: 181.4 },
      { at: '08-28', label: '周度体检：一减三持', price: 166, current: true },
    ],
    coverage: [
      { label: '持仓 / 成本', status: 'ok', note: 'Longbridge 实时' },
      { label: '20 日均线 / 相对强弱', status: 'ok', note: '本机计算' },
      { label: '上周决策记录', status: 'ok', note: 'journal/decisions' },
      { label: '期权持仓', status: 'missing', note: '该账户未授权' },
    ],
    source: { from: 'Longbridge', at: '2026-08-28 16:00 ET' },
  },
];

export const canvasIndexOf = (slug: string): number =>
  DEMO_CANVASES.findIndex((canvas) => canvas.slug === slug);

export const signedText = (value: number, suffix = ''): string =>
  `${value > 0 ? '+' : ''}${value}${suffix}`;

export const maxAbs = (values: number[]): number =>
  values.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);

export const barShare = (value: number, peak: number): number =>
  peak === 0 ? 0 : Math.abs(value) / peak;
