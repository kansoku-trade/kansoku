import type { MarketEventClass } from '@kansoku/shared/types';
import type { Trigger, TriggerKind } from '../../ai/personas/triggers.js';
import type { EventSourceAdapter } from '../registry.js';
import type { MarketEventDraft } from '../types.js';

export const KERNEL_TRIGGER_SOURCE = 'kernel-triggers';

export interface TriggerObservation {
  symbol: string;
  triggers: Trigger[];
  // When the bars that produced the triggers closed, not when we noticed. Required:
  // the caller ran the detector on a specific bar and is the only one who knows which.
  occurredAt: string;
}

type Listener = (observation: TriggerObservation) => void;

const listeners = new Set<Listener>();

export function onTriggerObservation(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A subscription the runtime failed to tear down would keep feeding a dead source;
// this makes that leak assertable instead of silent.
export function triggerObservationListenerCount(): number {
  return listeners.size;
}

// detectTriggers stays pure: the caller that already ran it hands the result here,
// so the detector has no idea an event pipeline exists.
export function publishTriggerObservation(observation: TriggerObservation): void {
  for (const listener of listeners) {
    try {
      listener(observation);
    } catch {
      // One broken subscriber must not stop the others from seeing the trigger.
      continue;
    }
  }
}

// A flow flip is money moving and a macro reaction is a macro event; only the
// chart-shape triggers are "technical". The timeline filters on class, so folding
// them all together would hide two of them from their own views.
const CLASS_BY_KIND: Partial<Record<TriggerKind, MarketEventClass>> = {
  flow_flip: 'flow',
  macro_react: 'macro',
};

export function createTriggerAdapter(): EventSourceAdapter {
  return {
    // Push-only: this is the base reconnect delay the runtime uses, not a cadence.
    intervalMs: 5000,
    source: KERNEL_TRIGGER_SOURCE,
    subscribe: ({ emit }) =>
      onTriggerObservation((observation) => {
        const symbol = observation.symbol.trim().toUpperCase();
        if (!symbol) return;
        // Dropped rather than dated now, missing time included: a trigger stamped
        // "when we noticed" points at the wrong bar, which is worse on a timeline
        // than one that never arrives.
        const at = observation.occurredAt ? Date.parse(observation.occurredAt) : Number.NaN;
        if (!Number.isFinite(at)) return;
        if (observation.triggers.length === 0) return;
        const occurredAt = new Date(at).toISOString();
        const drafts: MarketEventDraft[] = observation.triggers.map((trigger) => ({
          class: CLASS_BY_KIND[trigger.kind] ?? 'technical',
          dedupeKey: `${symbol}|${trigger.kind}|${occurredAt}`,
          kind: trigger.kind,
          occurredAt,
          payload: {
            data: { detail: trigger.detail, triggerKind: trigger.kind },
            title: trigger.detail,
          },
          severity: 'notable',
          source: KERNEL_TRIGGER_SOURCE,
          symbols: [symbol],
          trust: 'verified',
        }));
        emit({ drafts });
      }),
  };
}
