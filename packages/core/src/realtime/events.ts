import type { MarketEvent } from '@kansoku/shared/types';
import { onMarketEvent } from '../events/bus.js';
import {
  onEventCanvasProgress,
  type EventCanvasProgress,
} from '../events/canvasProgress.js';
import { listEvents } from '../events/store.js';

const INIT_LIMIT = 50;

function matches(event: MarketEvent, symbol: string | null): boolean {
  return symbol === null || event.symbols.includes(symbol);
}

function matchesProgress(progress: EventCanvasProgress, symbol: string | null): boolean {
  return symbol === null || progress.symbols.includes(symbol);
}

export async function subscribeEvents(
  symbol: string | null,
  push: (envelope: string) => void,
): Promise<() => void> {
  let buffered: MarketEvent[] = [];
  let ready = false;
  const unsubEvent = onMarketEvent((event) => {
    if (!matches(event, symbol)) return;
    if (ready) push(JSON.stringify({ type: 'event', event }));
    else buffered.push(event);
  });
  const unsubCanvas = onEventCanvasProgress((progress) => {
    if (!matchesProgress(progress, symbol)) return;
    push(JSON.stringify({ type: 'canvas', ...progress }));
  });

  try {
    const events = await listEvents({
      ...(symbol !== null ? { symbol } : {}),
      limit: INIT_LIMIT,
    });
    push(JSON.stringify({ type: 'init', events }));
    const seen = new Set(events.map((event) => event.id));
    ready = true;
    for (const event of buffered) {
      if (seen.has(event.id)) continue;
      push(JSON.stringify({ type: 'event', event }));
    }
    buffered = [];
  } catch (error) {
    // Handing the failure up to the caller only works if nothing is left behind:
    // a half-open subscriber would keep buffering events for a dead socket.
    unsubEvent();
    unsubCanvas();
    buffered = [];
    throw error;
  }
  return () => {
    unsubEvent();
    unsubCanvas();
  };
}
