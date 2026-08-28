import type { MarketEvent } from '@kansoku/shared/types';

type Listener = (event: MarketEvent) => void;

const listeners = new Set<Listener>();

export function onMarketEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A subscriber that fails to set itself up must not stay attached; this makes that
// leak observable instead of silent.
export function marketEventListenerCount(): number {
  return listeners.size;
}

export function publishMarketEvent(event: MarketEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      continue;
    }
  }
}
