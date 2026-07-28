export type ResearchKind = 'stock' | 'journal';

export interface ResearchDoc {
  path: string;
  kind: ResearchKind;
  typeLabel: string;
  title: string;
  listTitle: string;
  date: string;
  mtime: string;
  symbols: string[];
  excerpt: string;
  markdown: string;
}

export const RESEARCH_DOCS: ResearchDoc[] = [
  {
    path: 'stocks/NVDA.md',
    kind: 'stock',
    typeLabel: '股票档案',
    title: 'NVDA · 英伟达',
    listTitle: 'NVDA · 英伟达',
    date: '2026-07-28',
    mtime: '07-28 21:14',
    symbols: ['NVDA'],
    excerpt: '六视角笔记：生意 / 基本面 / 技术面 / 催化剂 / 供应链 / 复核',
    markdown: `## 生意

数据中心 GPU 加上 CUDA 生态，客户集中在四家超大规模云厂商。收入结构从游戏转到数据中心之后，季度波动跟着云资本开支走，不再跟着消费周期走。

## 基本面

- FY26Q1 数据中心收入 391 亿美元，环比 +12%
- 毛利率 71.3%，指引区间 70–72%
- 递延收入连续三个季度抬升，说明订单排到了后面

## 技术面

价格在 50 日均线（最近 50 个交易日的平均价，常被当作中期支撑）上方 2.96%，SEPA 趋势模板 8 条全过。距 52 周高点 −6.18%。

## 催化剂

- 8/27 财报（来自 \`finance-calendar report\`，不是新闻里抄的）
- GTC 主题演讲
- 对华出口许可进展

## 供应链与同行

上游 TSMC / SK 海力士（HBM），下游 SMCI / DELL 整机，同业 AMD / AVGO。韩股内存链常常先动，见 \`_chain-ai-stack.md\`。

## 复核

上一版把「递延收入抬升」写成了确定性利好，这一版改成条件句：**只有在毛利率不下滑的前提下**才成立。`,
  },
  {
    path: 'stocks/MU.md',
    kind: 'stock',
    typeLabel: '股票档案',
    title: 'MU · 美光',
    listTitle: 'MU · 美光',
    date: '2026-07-22',
    mtime: '07-22 15:02',
    symbols: ['MU'],
    excerpt: 'HBM 产能爬坡与内存周期位置，韩股先行信号的验证记录',
    markdown: `## 生意

DRAM 与 NAND，周期性极强。这一轮的变量是 HBM——单价高、产能被提前锁定，把传统内存周期的节奏改写了。

## 周期位置

现货价连续 11 周上行，但合约价的抬升幅度更小，两者的缺口是这轮判断的关键。

## 韩股先行

SK 海力士 / 三星电子的日内走势通常领先美股内存链一个交易日。2026-07-14 那次判断就是靠这条先看到的。

## 未决问题

- 产能爬坡是否会在 FY27 上半年造成供给过剩
- HBM4 的份额分配还没有公开口径`,
  },
  {
    path: 'journal/2026-07-28-flow.md',
    kind: 'journal',
    typeLabel: '资金流',
    title: '2026-07-28 资金流快照',
    listTitle: '资金流快照',
    date: '2026-07-28',
    mtime: '07-28 16:31',
    symbols: ['NVDA', 'AMD', 'AVGO'],
    excerpt: '半导体净流入连续第三天，软件云同期净流出，轮动叙事只有一个',
    markdown: `## 一句话

钱从软件云挪到了半导体，连续第三天。

## 分组净流入（收盘口径）

| 分组 | 今日 | 三日累计 |
| --- | --- | --- |
| 指数 | +12.4 亿 | +31.8 亿 |
| 半导体 | +38.7 亿 | +96.2 亿 |
| 软件云 | −21.3 亿 | −55.6 亿 |
| 大型科技 | +4.1 亿 | −2.7 亿 |

## 唯一的轮动叙事

半导体单边吸金、软件云单边失血，两边幅度对称——是同一笔钱在换位置，不是两件独立的事。

## 不解释的部分

大型科技今日 +4.1 亿、三日 −2.7 亿，都在噪音范围内，不编故事。`,
  },
  {
    path: 'journal/2026-07-27-recap.md',
    kind: 'journal',
    typeLabel: '复盘',
    title: '2026-07-27 复盘',
    listTitle: '复盘',
    date: '2026-07-27',
    mtime: '07-27 22:08',
    symbols: ['NVDA'],
    excerpt: '把「反弹到日内高点」错认成「突破」，教训已进 lessons.md',
    markdown: `## 判断回看

盘中写下「已突破盘前高」，事后核对是错的：价格回到了**日内高点**，但盘前高在更上面 1.2%，从未收上去。

## 错在哪

看的是同一根 K 线的两个不同参照物，把「反弹到日内高点」当成了「突破盘前高」。

## 沉淀

已写入 \`journal/lessons.md\`：**说「突破」之前，先把参照价位念出来。**`,
  },
  {
    path: 'journal/lessons.md',
    kind: 'journal',
    typeLabel: '交易教训',
    title: '交易教训清单',
    listTitle: '交易教训清单',
    date: '2026-07-27',
    mtime: '07-27 22:11',
    symbols: [],
    excerpt: '一行一条带日期，短线预测每次运行前必读',
    markdown: `- **2026-07-27** 说「突破」之前，先把参照价位念出来（日内高 ≠ 盘前高 ≠ 前高）。
- **2026-07-14** 韩股内存链领先一个交易日，别等美股确认了再看。
- **2026-07-09** ±2% 的日内波动不配拥有理由，别给噪音编故事。
- **2026-06-27** 持仓计划 A–D 四条线写死之后不许临场改，要改就新开一条判断。`,
  },
];
