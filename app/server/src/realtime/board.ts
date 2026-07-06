import { BASE_URL } from "../env.js";
import { buildOverviewBoard } from "../services/cockpit/board.js";
import { getLongbridgeStream } from "../services/marketdata/longbridgeStream.js";
import { createEmitter, emitData, emitStatus, replay } from "./emitter.js";

const THROTTLE_MS = 2_000;

function chartUrl(id: string): string {
  return `${BASE_URL}/charts/${encodeURIComponent(id)}`;
}

const emitter = createEmitter();
let quoteUnsub: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let refreshing: Promise<void> | null = null;

async function refresh(): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const board = await buildOverviewBoard(chartUrl);
      emitStatus(emitter, false);
      emitData(emitter, board);
    } catch (err) {
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
  if (quoteUnsub) return;
  quoteUnsub = getLongbridgeStream().onUpdate(() => scheduleRefresh());
}

export function subscribeBoard(push: (envelope: string) => void): () => void {
  emitter.listeners.add(push);
  ensureListener();
  if (emitter.lastEnvelope) replay(emitter, push);
  else void refresh();

  return () => {
    emitter.listeners.delete(push);
    if (emitter.listeners.size === 0) {
      quoteUnsub?.();
      quoteUnsub = null;
      if (timer) clearTimeout(timer);
      timer = null;
      emitter.lastEnvelope = null;
      emitter.degraded = false;
    }
  };
}
