import type { AgentEvent, AgentMessage } from '@earendil-works/pi-agent-core';
import { appendUsage } from './usageStore.js';

export interface UsageSnapshot {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning?: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

interface UsageTotal extends UsageSnapshot {
  calls: number;
}

export interface AiUsageLogContext {
  layer:
    | 'commentator'
    | 'analyst'
    | 'event-filter'
    | 'chat'
    | 'chat-suggest'
    | 'research-chat'
    | 'research-refresh'
    | 'memory'
    | 'assistant';
  symbol: string;
  model: { provider?: string; id?: string };
  origin?: string;
  persistUsage?: boolean;
}

function emptyUsage(): UsageTotal {
  return {
    calls: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

export function isUsage(value: unknown): value is UsageSnapshot {
  if (!value || typeof value !== 'object') return false;
  const usage = value as Record<string, unknown>;
  const cost = usage.cost as Record<string, unknown> | undefined;
  return (
    typeof usage.input === 'number' &&
    typeof usage.output === 'number' &&
    typeof usage.cacheRead === 'number' &&
    typeof usage.cacheWrite === 'number' &&
    typeof usage.totalTokens === 'number' &&
    Boolean(cost) &&
    typeof cost?.total === 'number'
  );
}

function getUsage(message: AgentMessage): UsageSnapshot | null {
  const usage = (message as { usage?: unknown }).usage;
  return isUsage(usage) ? usage : null;
}

function hasBillableSignal(usage: UsageSnapshot): boolean {
  return usage.totalTokens > 0 || usage.cost.total > 0;
}

function addUsage(total: UsageTotal, usage: UsageSnapshot): void {
  total.calls += 1;
  total.input += usage.input;
  total.output += usage.output;
  total.cacheRead += usage.cacheRead;
  total.cacheWrite += usage.cacheWrite;
  total.reasoning = (total.reasoning ?? 0) + (usage.reasoning ?? 0);
  total.totalTokens += usage.totalTokens;
  total.cost.input += usage.cost.input;
  total.cost.output += usage.cost.output;
  total.cost.cacheRead += usage.cost.cacheRead;
  total.cost.cacheWrite += usage.cost.cacheWrite;
  total.cost.total += usage.cost.total;
}

function money(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  if (value === 0) return '$0';
  if (Math.abs(value) >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
}

function usageText(usage: UsageSnapshot | UsageTotal): string {
  const reasoning = usage.reasoning ? ` reasoning=${usage.reasoning}` : '';
  return [
    `tokens=${usage.totalTokens}`,
    `input=${usage.input}`,
    `output=${usage.output}`,
    `cacheRead=${usage.cacheRead}`,
    `cacheWrite=${usage.cacheWrite}`,
    `${reasoning}`,
    `spend=${money(usage.cost.total)}`,
  ]
    .filter(Boolean)
    .join(' ');
}

function prefix(ctx: AiUsageLogContext): string {
  const model = `${ctx.model.provider ?? 'unknown'}/${ctx.model.id ?? 'unknown'}`;
  const origin = ctx.origin ? ` origin=${ctx.origin}` : '';
  return `[ai-usage] layer=${ctx.layer} symbol=${ctx.symbol} model=${model}${origin}`;
}

export function attachAiUsageLogger(agent: unknown, ctx: AiUsageLogContext): void {
  const subscribe = (agent as { subscribe?: unknown })?.subscribe;
  if (typeof subscribe !== 'function') return;

  const total = emptyUsage();
  subscribe.call(agent, (event: AgentEvent) => {
    if (event.type === 'message_end') {
      const usage = getUsage(event.message);
      if (!usage || !hasBillableSignal(usage)) return;
      addUsage(total, usage);
      console.log(`${prefix(ctx)} call=${total.calls} ${usageText(usage)}`);
      return;
    }

    if (event.type !== 'agent_end') return;
    if (total.calls === 0) {
      for (const message of event.messages) {
        const usage = getUsage(message);
        if (usage && hasBillableSignal(usage)) addUsage(total, usage);
      }
    }
    console.log(`${prefix(ctx)} total calls=${total.calls} ${usageText(total)}`);
    if (ctx.persistUsage !== false) persistTotal(total, ctx);
    // Reused commentator sessions emit agent_end once per run on the same
    // agent — reset so each run persists its own delta, not a running sum.
    Object.assign(total, emptyUsage());
  });
}

function persistTotal(total: UsageTotal, ctx: AiUsageLogContext): void {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return;
  if (total.calls === 0 && total.totalTokens === 0) return;
  void appendUsage({
    ts: new Date().toISOString(),
    layer: ctx.layer,
    symbol: ctx.symbol,
    model: `${ctx.model.provider ?? 'unknown'}/${ctx.model.id ?? 'unknown'}`,
    ...(ctx.origin ? { origin: ctx.origin } : {}),
    calls: total.calls,
    total_tokens: total.totalTokens,
    input: total.input,
    output: total.output,
    cache_read: total.cacheRead,
    cache_write: total.cacheWrite,
    cost_total: total.cost.total,
  }).catch((err) =>
    console.error('[ai-usage] persist failed:', err instanceof Error ? err.message : String(err)),
  );
}
