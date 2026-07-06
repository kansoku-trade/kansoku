import { buildBenchmark } from "../services/cockpit/benchmark.js";
import { toTs } from "../services/indicators.js";
import { getLongbridgeStream } from "../services/marketdata/longbridgeStream.js";
import { getProvider } from "../services/marketdata/registry.js";
import { classifySession } from "../services/session.js";
import { createEmitter, emitData, emitStatus, replay } from "./emitter.js";

const BENCHMARK_SYMBOLS = ["SMH.US", "QQQ.US"];
const BAR_COUNT = 100;
const THROTTLE_MS = 5_000;

interface State {
  emitter: ReturnType<typeof createEmitter>;
  symbols: string[];
  quoteUnsub: (() => void) | null;
  timer: ReturnType<typeof setTimeout> | null;
  refreshing: Promise<void> | null;
}

const states = new Map<string, State>();

async function refresh(symbol: string, state: State): Promise<void> {
  if (state.refreshing) return state.refreshing;
  state.refreshing = (async () => {
    try {
      const { symbols } = state;
      const barsList = await Promise.all(symbols.map((s) => getProvider().getKline(s, "5m", BAR_COUNT)));
      const regularBars = barsList.map((bars) => bars.filter((b) => classifySession(toTs(b.time)) === "regular"));
      const data = buildBenchmark(symbols.map((s, i) => ({ symbol: s, bars: regularBars[i] })));
      emitStatus(state.emitter, false);
      emitData(state.emitter, data);
    } catch (err) {
      emitStatus(state.emitter, true, err instanceof Error ? err.message : String(err));
    }
  })().finally(() => {
    state.refreshing = null;
  });
  return state.refreshing;
}

function scheduleRefresh(symbol: string, state: State): void {
  if (state.timer) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    void refresh(symbol, state);
  }, THROTTLE_MS);
}

export function subscribeBenchmark(symbol: string, push: (envelope: string) => void): () => void {
  let state = states.get(symbol);
  const fresh = !state;
  if (!state) {
    const symbols = [symbol, ...BENCHMARK_SYMBOLS.filter((s) => s !== symbol)];
    state = { emitter: createEmitter(), symbols, quoteUnsub: null, timer: null, refreshing: null };
    states.set(symbol, state);
  }
  state.emitter.listeners.add(push);

  if (fresh) {
    void getLongbridgeStream()
      .retain(state.symbols)
      .catch((err) => console.warn("[ws-benchmark] retain failed", err));
    state.quoteUnsub = getLongbridgeStream().onUpdate((cell) => {
      if ((state as State).symbols.includes(cell.symbol)) scheduleRefresh(symbol, state as State);
    });
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
      if (s.timer) clearTimeout(s.timer);
      states.delete(symbol);
      void getLongbridgeStream()
        .release(s.symbols)
        .catch(() => {});
    }
  };
}
