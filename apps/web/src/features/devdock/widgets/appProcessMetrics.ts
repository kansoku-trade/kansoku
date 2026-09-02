import { useSyncExternalStore } from 'react';
import { getShellRpc } from '../../desktop/shellRpc';

export interface AppProcessMetrics {
  cpuPercent: number;
  gpu: { cpuPercent: number; memoryMB: number } | null;
  rendererResidentMB: number | null;
}

const SAMPLE_INTERVAL_MS = 2000;
const listeners = new Set<() => void>();
let snapshot: AppProcessMetrics | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let primed = false;

async function sample(): Promise<void> {
  const rpc = getShellRpc();
  if (!rpc) return;
  try {
    const next = (await rpc.invoke('devtools.getProcessMetrics')) as AppProcessMetrics;
    // Electron reports CPU since the previous getAppMetrics call, so the first
    // sample spans an arbitrary window: prime once and drop it.
    if (!primed) {
      primed = true;
      return;
    }
    snapshot = next;
    for (const listener of listeners) listener();
  } catch {
    /* IPC unavailable: widgets stay hidden */
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer) {
    primed = false;
    void sample();
    timer = setInterval(() => void sample(), SAMPLE_INTERVAL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0 || !timer) return;
    clearInterval(timer);
    timer = null;
    snapshot = null;
  };
}

const getSnapshot = () => snapshot;

// One shared sampler: a second poller would reset Electron's CPU window for both.
export function useAppProcessMetrics(): AppProcessMetrics | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
