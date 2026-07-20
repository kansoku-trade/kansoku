import { chartUrl } from '../platform/chartUrl.js';
import { buildOverviewBoard } from '../cockpit/board.js';
import { distinctStreams } from '../marketdata/streamRouting.js';
import { createEmitter, emitData, emitStatus, replay } from './emitter.js';

const THROTTLE_MS = 2_000;
const SLOW_REFRESH_MS = 60_000;

const emitter = createEmitter();
let quoteUnsubs: Array<() => void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let slowTimer: ReturnType<typeof setInterval> | null = null;
let refreshing: Promise<void> | null = null;

async function refresh(): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const board = await buildOverviewBoard(chartUrl);
      if (emitter.listeners.size === 0) return;
      emitStatus(emitter, false);
      emitData(emitter, board);
    } catch (err) {
      if (emitter.listeners.size === 0) return;
      emitStatus(emitter, true, err instanceof Error ? err.message : String(err));
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

function scheduleRefresh(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void refresh();
  }, THROTTLE_MS);
}

function ensureListener(): void {
  if (quoteUnsubs) return;
  quoteUnsubs = distinctStreams().map((stream) => stream.onUpdate(() => scheduleRefresh()));
  slowTimer = setInterval(() => void refresh(), SLOW_REFRESH_MS);
}

export function subscribeBoard(push: (envelope: string) => void): () => void {
  emitter.listeners.add(push);
  ensureListener();
  if (emitter.lastEnvelope) replay(emitter, push);
  else void refresh();

  return () => {
    emitter.listeners.delete(push);
    if (emitter.listeners.size === 0) {
      if (quoteUnsubs) for (const unsub of quoteUnsubs) unsub();
      quoteUnsubs = null;
      if (timer) clearTimeout(timer);
      timer = null;
      if (slowTimer) clearInterval(slowTimer);
      slowTimer = null;
      emitter.lastEnvelope = null;
      emitter.degraded = false;
    }
  };
}
