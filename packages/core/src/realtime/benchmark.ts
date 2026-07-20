import { buildBenchmark } from '../cockpit/benchmark.js';
import { toTs } from '../analysis/indicators.js';
import { getProvider } from '../marketdata/registry.js';
import {
  distinctStreams,
  releaseSymbols,
  retainSymbols,
} from '../marketdata/streamRouting.js';
import { classifySession } from '../marketdata/session.js';
import { marketOf } from '../symbols/symbol.utils.js';
import { createEmitter, emitData, emitStatus, replay } from './emitter.js';

const BENCHMARK_SYMBOLS = ['SMH.US', 'QQQ.US'];
const BAR_COUNT = 100;
const THROTTLE_MS = 5_000;

interface State {
  emitter: ReturnType<typeof createEmitter>;
  symbols: string[];
  quoteUnsubs: Array<() => void>;
  timer: ReturnType<typeof setTimeout> | null;
  refreshing: Promise<void> | null;
}

const states = new Map<string, State>();

async function refresh(symbol: string, state: State): Promise<void> {
  if (state.refreshing) return state.refreshing;
  state.refreshing = (async () => {
    try {
      const { symbols } = state;
      const barsList = await Promise.all(
        symbols.map((s) => getProvider(marketOf(s)).getKline(s, '5m', BAR_COUNT)),
      );
      const regularBars = symbols.map((s, i) =>
        barsList[i].filter((b) => classifySession(toTs(b.time), marketOf(s)) === 'regular'),
      );
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
    state = { emitter: createEmitter(), symbols, quoteUnsubs: [], timer: null, refreshing: null };
    states.set(symbol, state);
  }
  state.emitter.listeners.add(push);

  if (marketOf(symbol) !== 'US') {
    if (fresh) emitData(state.emitter, []);
    else replay(state.emitter, push);
    return () => {
      const s = states.get(symbol);
      if (!s) return;
      s.emitter.listeners.delete(push);
      if (s.emitter.listeners.size === 0) states.delete(symbol);
    };
  }

  if (fresh) {
    void retainSymbols(state.symbols).catch((err) =>
      console.warn('[ws-benchmark] retain failed', err),
    );
    state.quoteUnsubs = distinctStreams().map((stream) =>
      stream.onUpdate((cell) => {
        if ((state as State).symbols.includes(cell.symbol)) scheduleRefresh(symbol, state as State);
      }),
    );
    void refresh(symbol, state);
  } else {
    replay(state.emitter, push);
  }

  return () => {
    const s = states.get(symbol);
    if (!s) return;
    s.emitter.listeners.delete(push);
    if (s.emitter.listeners.size === 0) {
      for (const unsub of s.quoteUnsubs) unsub();
      if (s.timer) clearTimeout(s.timer);
      states.delete(symbol);
      void releaseSymbols(s.symbols).catch(() => {});
    }
  };
}
