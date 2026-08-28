import type { MarketEventDraft } from './types.js';

export interface EventPollResult {
  drafts: MarketEventDraft[];
  // Absent means "leave the stored cursor alone"; null means "reset it".
  cursor?: string | null;
}

export interface EventPollContext {
  cursor: string | null;
  // Aborted when the runtime stops this source. An adapter that reaches the network
  // has to pass it down, or a shutdown leaves requests running for a collector that
  // no longer exists.
  signal?: AbortSignal;
}

export interface EventSubscribeContext {
  // Where the stream left off before the last shutdown, so a subscription can
  // replay instead of starting at "now".
  cursor: string | null;
  emit: (result: EventPollResult) => void;
  // The adapter's way of saying "this stream is broken": the runtime degrades the
  // source and reconnects on a backoff instead of pretending it is still live.
  fail: (error: unknown) => void;
}

export interface EventSourceAdapter {
  source: string;
  intervalMs: number;
  // Defaults to enabled. A disabled source is never contacted, and the runtime
  // still records it so the UI can say "off" instead of "quiet".
  enabled?: boolean;
  // Why it is off, surfaced through source health. "Off" without a reason reads as
  // a bug; a missing credential has to be nameable from the UI.
  disabledReason?: string;
  poll?: (ctx: EventPollContext) => Promise<EventPollResult>;
  subscribe?: (ctx: EventSubscribeContext) => (() => void) | Promise<() => void>;
}

const adapters = new Map<string, EventSourceAdapter>();

export function registerEventAdapter(adapter: EventSourceAdapter): void {
  if (adapters.has(adapter.source)) {
    throw new Error(`event adapter already registered for source ${adapter.source}`);
  }
  if (!adapter.poll && !adapter.subscribe) {
    throw new Error(`event adapter ${adapter.source} must provide poll or subscribe`);
  }
  if (adapter.poll && !(Number.isFinite(adapter.intervalMs) && adapter.intervalMs > 0)) {
    throw new Error(
      `event adapter ${adapter.source} needs a positive finite intervalMs, got ${adapter.intervalMs}`,
    );
  }
  adapters.set(adapter.source, adapter);
}

export function listEventAdapters(): EventSourceAdapter[] {
  return [...adapters.values()];
}

export function getEventAdapter(source: string): EventSourceAdapter | undefined {
  return adapters.get(source);
}

export function clearEventAdapters(): void {
  adapters.clear();
}
