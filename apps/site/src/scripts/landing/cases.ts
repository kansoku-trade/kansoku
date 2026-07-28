export interface EvidenceNode {
  tool: string;
  arg: string;
  value: string;
}

export interface HeroCase {
  symbol: string;
  direction: string;
  tone: 'up' | 'down' | 'neutral';
  probabilities: { bull: number; base: number; bear: number };
  trigger: string;
  nodes: EvidenceNode[];
}

export const heroCases: HeroCase[] = [
  {
    symbol: 'NVDA.US',
    direction: '偏多',
    tone: 'up',
    probabilities: { bull: 45, base: 35, bear: 20 },
    trigger: '站稳 186.40 且量能 > 1.2×',
    nodes: [
      { tool: 'fetch_kline', arg: '5m · 120 bars', value: '184.22' },
      { tool: 'technical', arg: 'MACD 1h', value: '底背驰' },
      { tool: 'capital-flow', arg: 'intraday', value: '+$1.24B' },
      { tool: 'quote', arg: 'realtime', value: '+1.83%' },
      { tool: 'finance-calendar', arg: 'report', value: '11/19' },
      { tool: 'news', arg: '24h · 3 条', value: 'neutral' },
      { tool: 'positions', arg: 'account', value: '0 股' },
    ],
  },
  {
    symbol: 'MU.US',
    direction: '偏空',
    tone: 'down',
    probabilities: { bull: 20, base: 32, bear: 48 },
    trigger: '跌破 236.10 且放量',
    nodes: [
      { tool: 'fetch_kline', arg: '15m · 96 bars', value: '241.06' },
      { tool: 'technical', arg: 'MACD 15m', value: '顶背驰' },
      { tool: 'capital-flow', arg: 'intraday', value: '−$780M' },
      { tool: 'quote', arg: 'realtime', value: '−0.94%' },
      { tool: 'finance-calendar', arg: 'macrodata', value: 'CPI 08/12' },
      { tool: 'news', arg: '24h · 7 条', value: 'negative' },
      { tool: 'positions', arg: 'account', value: '120 股' },
    ],
  },
  {
    symbol: 'SMH.US',
    direction: '观望',
    tone: 'neutral',
    probabilities: { bull: 33, base: 41, bear: 26 },
    trigger: '区间 342.0 – 351.5 内不动手',
    nodes: [
      { tool: 'fetch_kline', arg: '1h · 200 bars', value: '348.11' },
      { tool: 'technical', arg: 'RS vs SPY', value: '1.04' },
      { tool: 'capital-flow', arg: 'intraday', value: '+$96M' },
      { tool: 'quote', arg: 'realtime', value: '+0.31%' },
      { tool: 'constituent', arg: 'top movers', value: '18/25 涨' },
      { tool: 'news', arg: '24h · 2 条', value: 'neutral' },
      { tool: 'market-temp', arg: 'US', value: '62 / 100' },
    ],
  },
];
