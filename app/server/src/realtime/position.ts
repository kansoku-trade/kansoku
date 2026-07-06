import type { CockpitPosition, RelativeVolume } from "../../../shared/types.js";
import { buildCockpitPosition } from "../services/cockpit/position.js";
import { entryPlanFromDoc, latestIntradayDoc, type EntryPlan } from "../services/cockpit/entryPlan.js";
import { getLongbridgeStream } from "../services/marketdata/longbridgeStream.js";
import { getProvider } from "../services/marketdata/registry.js";
import type { RawPosition } from "../services/marketdata/types.js";
import { computeRelativeVolume } from "../services/relvol.js";
import { createEmitter, emitData, emitStatus, replay } from "./emitter.js";

const SLOW_REFRESH_MS = 60_000;
const PUSH_THROTTLE_MS = 1_000;
const RELVOL_BARS = 500;

export interface PositionPayload {
  position: CockpitPosition | null;
  relvol: RelativeVolume | null;
}

interface State {
  emitter: ReturnType<typeof createEmitter>;
  positions: RawPosition[];
  plan: EntryPlan | null;
  relvol: RelativeVolume | null;
  quoteUnsub: (() => void) | null;
  slowTimer: ReturnType<typeof setInterval> | null;
  pushTimer: ReturnType<typeof setTimeout> | null;
  refreshing: Promise<void> | null;
}

const states = new Map<string, State>();

/** Pure: cached position snapshot × a live quote → the channel payload. */
export function buildPositionPayload(
  positions: RawPosition[],
  symbol: string,
  last: number,
  plan: EntryPlan | null,
  relvol: RelativeVolume | null,
): PositionPayload {
  return { position: buildCockpitPosition(positions, symbol, last, plan), relvol };
}

function pushLatest(state: State, symbol: string): void {
  const quote = getLongbridgeStream().getSnapshot(symbol);
  if (!quote) return;
  emitData(state.emitter, buildPositionPayload(state.positions, symbol, quote.last, state.plan, state.relvol));
}

function schedulePush(state: State, symbol: string): void {
  if (state.pushTimer) return;
  state.pushTimer = setTimeout(() => {
    state.pushTimer = null;
    pushLatest(state, symbol);
  }, PUSH_THROTTLE_MS);
}

async function refresh(symbol: string, state: State): Promise<void> {
  if (state.refreshing) return state.refreshing;
  state.refreshing = (async () => {
    try {
      const provider = getProvider();
      const [positions, doc, bars] = await Promise.all([
        provider.getPositions?.() ?? Promise.resolve([]),
        latestIntradayDoc(symbol),
        provider.getKline(symbol, "15m", RELVOL_BARS).catch(() => null),
      ]);
      state.positions = positions;
      state.plan = entryPlanFromDoc(doc);
      state.relvol = bars ? computeRelativeVolume(bars) : state.relvol;
      emitStatus(state.emitter, false);
      pushLatest(state, symbol);
    } catch (err) {
      emitStatus(state.emitter, true, err instanceof Error ? err.message : String(err));
    }
  })().finally(() => {
    state.refreshing = null;
  });
  return state.refreshing;
}

export function subscribePosition(symbol: string, push: (envelope: string) => void): () => void {
  let state = states.get(symbol);
  const fresh = !state;
  if (!state) {
    state = {
      emitter: createEmitter(),
      positions: [],
      plan: null,
      relvol: null,
      quoteUnsub: null,
      slowTimer: null,
      pushTimer: null,
      refreshing: null,
    };
    states.set(symbol, state);
  }
  state.emitter.listeners.add(push);

  if (fresh) {
    void getLongbridgeStream()
      .retain([symbol])
      .catch((err) => console.warn("[ws-position] retain failed", err));
    state.quoteUnsub = getLongbridgeStream().onUpdate((cell) => {
      if (cell.symbol === symbol) schedulePush(state as State, symbol);
    });
    state.slowTimer = setInterval(() => void refresh(symbol, state as State), SLOW_REFRESH_MS);
    void refresh(symbol, state);
  } else {
    replay(state.emitter, push);
  }

  return () => {
    const s = states.get(symbol);
    if (!s) return;
    s.emitter.listeners.delete(push);
    if (s.emitter.listeners.size === 0) {
      s.quoteUnsub?.();
      if (s.slowTimer) clearInterval(s.slowTimer);
      if (s.pushTimer) clearTimeout(s.pushTimer);
      states.delete(symbol);
      void getLongbridgeStream()
        .release([symbol])
        .catch(() => {});
    }
  };
}
