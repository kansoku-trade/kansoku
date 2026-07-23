const PLACEHOLDER = '还没写。可在右侧让 AI 深度研究填充，或手动补充。';

function section(heading: string): string {
  return `## ${heading}\n\n${PLACEHOLDER}\n`;
}

export interface StockSkeletonInput {
  symbol: string;
  name: string;
  date: string;
  sepaUrl: string;
}

export function stockSkeleton(input: StockSkeletonInput): string {
  const sections = ['业务', '基本面', '技术面', '催化剂', '供应链与同行', '风险与待验证']
    .map(section)
    .join('\n');
  return (
    `# ${input.symbol} — ${input.name}\n\n` +
    `建档日期：${input.date}\n\n` +
    `[SEPA 仪表盘](${input.sepaUrl})\n\n` +
    `${sections}`
  );
}

export interface JournalSkeletonInput {
  title: string;
  date: string;
}

export function journalSkeleton(input: JournalSkeletonInput): string {
  const sections = ['背景', '观察', '结论', '待验证'].map(section).join('\n');
  return `# ${input.title}\n\n` + `日期：${input.date}\n\n` + `${sections}`;
}
