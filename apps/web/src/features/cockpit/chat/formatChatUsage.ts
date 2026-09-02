import type { ChatRow, ChatUsage } from './useChatSession';

const tokenFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const costFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export function usageFromRows(rows: ChatRow[]): ChatUsage | null {
  const total: Required<ChatUsage> = {
    totalTokens: 0,
    costTotal: 0,
    calls: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  };
  for (const row of rows) {
    const meta = row.meta;
    if (!meta) continue;
    total.calls += 1;
    total.totalTokens += meta.totalTokens;
    total.costTotal += meta.costTotal;
    total.input += meta.input ?? 0;
    total.output += meta.output ?? 0;
    total.cacheRead += meta.cacheRead ?? 0;
    total.cacheWrite += meta.cacheWrite ?? 0;
  }
  return total.calls === 0 ? null : total;
}

export function cacheHitRate(usage: ChatUsage): number | null {
  const cached = usage.cacheRead ?? 0;
  const input = usage.input ?? 0;
  const denom = input + cached;
  if (cached <= 0 || denom <= 0) return null;
  return Math.round((cached / denom) * 100);
}

export function formatUsageLine(usage: ChatUsage): string {
  const parts = [`${tokenFormatter.format(usage.totalTokens)} tok`, costFormatter.format(usage.costTotal)];
  const hit = cacheHitRate(usage);
  if (hit !== null) parts.push(`cache ${hit}%`);
  return parts.join(' · ');
}
