import { DEMO_CANVASES } from './canvasDocs';

export interface DemoChatToolCall {
  title: string;
  items: string[];
}

export type DemoChatBlock =
  | { type: 'user'; text: string }
  | { type: 'tools'; calls: DemoChatToolCall[] }
  | { type: 'assistant'; paragraphs: string[]; meta: string }
  | { type: 'canvas'; slug: string }
  | { type: 'thinking' };

export interface DemoChatSession {
  title: string;
  date: string;
  blocks: DemoChatBlock[];
}

export const canvasTitle = (slug: string): string =>
  DEMO_CANVASES.find((canvas) => canvas.slug === slug)?.title ?? slug;

export const CHAT_SESSIONS: DemoChatSession[] = [
  {
    title: 'MU 跌幅是板块还是个股',
    date: '08-28',
    blocks: [
      { type: 'user', text: 'MU 今天跌这么多，是板块一起跌还是它自己的事？' },
      {
        type: 'tools',
        calls: [
          { title: '查行情', items: ['MU.US', 'SMH.US'] },
          { title: '查资金流', items: ['MU.US', 'intraday'] },
          { title: '查新闻', items: ['MU', '24h'] },
        ],
      },
      {
        type: 'assistant',
        paragraphs: [
          'MU 收 61.20，跌 2.4%；同一时段 SMH（半导体板块基金）只跌 0.8%。差了 1.6 个点，是个股自己的事，不是板块拖的。',
          '但资金流跟价格对不上：全天净流入 3150 万美元，14:10 之后还在加速，价格没跟。成交额 19.6B，比 20 日均量放大。24 小时内没有公司公告，新闻只有两条转述分析师下调目标价。',
          '期权持仓这个账户没有权限，看不了。价格弱、资金不弱，当天不当追空。',
        ],
        meta: 'claude-sonnet-4.5 · 3,412 tokens · $0.0186',
      },
      { type: 'canvas', slug: 'mu-session' },
      { type: 'user', text: '把存储链另外几只的资金也放上去，看是不是整条链在动' },
      { type: 'thinking' },
    ],
  },
  {
    title: 'NVDA 盘前跳空怎么看',
    date: '08-27',
    blocks: [
      { type: 'user', text: 'NVDA 盘前跳空了，算突破吗' },
      {
        type: 'tools',
        calls: [
          { title: '查行情', items: ['NVDA.US', 'premarket'] },
          { title: '查财报日历', items: ['NVDA', '30d'] },
          { title: '查新闻', items: ['NVDA', '12h'] },
        ],
      },
      {
        type: 'assistant',
        paragraphs: [
          '先说结论：不算。盘前最高 196.65，还在昨天低点 195.44 上方一点点，离昨天高点 208.75 差 6%。这是回到昨天的区间里，不是突破。',
          '12 小时内没有公司公告，跳空跟着期货走。今晚盘后出财报，跳空的钱多半是财报前的仓位调整。',
          '要看突破，等 15 分钟收盘放量站上 198.70，再回踩守住 196.65。没到之前按区间处理。',
        ],
        meta: 'claude-sonnet-4.5 · 2,180 tokens · $0.0121',
      },
      { type: 'user', text: '那把财报前后的关键价位和资金拼一张' },
      { type: 'canvas', slug: 'nvda-earnings-map' },
    ],
  },
  {
    title: '存储链资金轮动',
    date: '08-26',
    blocks: [
      { type: 'user', text: '这几天是不是钱从 GPU 挪到存储了？把整条链看一下' },
      {
        type: 'tools',
        calls: [
          { title: '查资金流', items: ['MU.US', 'SNDK.US', 'WDC.US', 'STX.US', '5d'] },
          { title: '查资金流', items: ['NVDA.US', 'SMH.US', '5d'] },
          { title: '查行情', items: ['000660.KS', '5d'] },
        ],
      },
      {
        type: 'assistant',
        paragraphs: [
          '挪了，但只挪到一半。5 天里 MU 净流入 9630 万、SNDK 4170 万，NVDA 同期净流出 4210 万。海力士周内先涨了 6.8%，美股存储是跟着韩国动的。',
          '硬盘那两家没份：WDC、STX 都是净流出，相对板块还在落后。这是 DRAM / NAND 的轮动，不是整条存储链。',
          'DRAM 合约价传闻没有报价单能核实，先记成「未知」。',
        ],
        meta: 'claude-sonnet-4.5 · 4,065 tokens · $0.0224',
      },
      { type: 'canvas', slug: 'memory-chain-rotation' },
    ],
  },
  {
    title: 'CPI 前要不要减仓',
    date: '08-25',
    blocks: [
      { type: 'user', text: '周五 CPI，我现在这几只要不要先减一点？' },
      {
        type: 'tools',
        calls: [
          { title: '查持仓', items: ['Longbridge', '4 只'] },
          { title: '查宏观日历', items: ['CPI', 'FOMC', '14d'] },
          { title: '查技术指标', items: ['NVDA', 'MU', 'TSM', 'AMD', 'MA20'] },
        ],
      },
      {
        type: 'assistant',
        paragraphs: [
          '不按 CPI 减，按你自己的规则减。四只里只有 AMD 踩线：收盘跌破 20 日均线已经两天，相对板块落后一周，A 线和 C 线同时触发。',
          'NVDA、MU、TSM 都在盈利，离止损最近的也有 6.2%。要做的是把止损上移到成本以上，不是因为一个宏观数据全减。',
          '周五 CPI 前不新开仓；周三 NVDA 财报是更近的事件，先处理它。',
        ],
        meta: 'claude-sonnet-4.5 · 3,790 tokens · $0.0203',
      },
      { type: 'canvas', slug: 'position-review' },
    ],
  },
];
