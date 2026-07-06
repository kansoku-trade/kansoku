export interface AnalysisCreatedMessage {
  type: "analysis-created";
  symbol: string;
  chartId: string;
}

type Listener = (envelope: string) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribeAnalyses(symbol: string, push: (envelope: string) => void): () => void {
  let set = listeners.get(symbol);
  if (!set) {
    set = new Set();
    listeners.set(symbol, set);
  }
  set.add(push);
  return () => {
    const current = listeners.get(symbol);
    if (!current) return;
    current.delete(push);
    if (current.size === 0) listeners.delete(symbol);
  };
}

export function publishAnalysisCreated({ symbol, chartId }: { symbol: string; chartId: string }): void {
  const set = listeners.get(symbol);
  if (!set) return;
  const envelope = JSON.stringify({ type: "analysis-created", symbol, chartId } satisfies AnalysisCreatedMessage);
  for (const push of [...set]) {
    try {
      push(envelope);
    } catch {
      continue;
    }
  }
}
