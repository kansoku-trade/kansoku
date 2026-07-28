export interface ScoredJudgment {
  symbol: string;
  date: string;
  call: string;
  outcome: 'hit' | 'miss';
}

export const scoredJudgments: ScoredJudgment[] = [
  { symbol: 'NVDA.US', date: '2026-07-02', call: '偏多 · 站稳 186.40', outcome: 'hit' },
  { symbol: 'MU.US', date: '2026-07-03', call: '偏空 · 跌破 789.10', outcome: 'hit' },
  { symbol: 'SMH.US', date: '2026-07-05', call: '观望 · 518.3–536.0 区间', outcome: 'hit' },
  { symbol: 'AVGO.US', date: '2026-07-08', call: '偏多 · 突破前高放量', outcome: 'miss' },
  { symbol: 'TSM.US', date: '2026-07-09', call: '偏空 · 1h MACD 顶背驰', outcome: 'hit' },
  { symbol: 'AMD.US', date: '2026-07-11', call: '偏多 · 站稳 20 日均线', outcome: 'miss' },
  { symbol: 'META.US', date: '2026-07-14', call: '观望 · 区间上沿承压', outcome: 'hit' },
  { symbol: 'MRVL.US', date: '2026-07-15', call: '偏多 · 缩量回踩不破', outcome: 'hit' },
  { symbol: 'QCOM.US', date: '2026-07-17', call: '偏空 · 跌破颈线', outcome: 'miss' },
  { symbol: 'ARM.US', date: '2026-07-18', call: '偏多 · 放量突破前高', outcome: 'hit' },
  { symbol: 'INTC.US', date: '2026-07-21', call: '偏空 · 反弹遇阻回落', outcome: 'hit' },
  { symbol: 'AAPL.US', date: '2026-07-23', call: '观望 · 窄幅盘整不破', outcome: 'hit' },
];

export const hitRate = (records: ScoredJudgment[]): number => {
  if (records.length === 0) return 0;
  const hits = records.filter((record) => record.outcome === 'hit').length;
  return Math.round((hits / records.length) * 100);
};
