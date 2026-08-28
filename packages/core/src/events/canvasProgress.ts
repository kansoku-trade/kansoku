import type { EventCanvasPhase } from '../contract/events.js';

export type { EventCanvasPhase };

export interface EventCanvasProgress {
  eventId: string;
  clusterId: string;
  slug: string;
  symbols: string[];
  phase: EventCanvasPhase;
  error: string | null;
}

type Listener = (progress: EventCanvasProgress) => void;

const listeners = new Set<Listener>();

export function onEventCanvasProgress(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function eventCanvasProgressListenerCount(): number {
  return listeners.size;
}

export function publishEventCanvasProgress(progress: EventCanvasProgress): void {
  for (const listener of listeners) {
    try {
      listener(progress);
    } catch {
      continue;
    }
  }
}
