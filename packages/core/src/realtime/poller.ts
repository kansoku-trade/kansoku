export interface PollerHandle {
  subscribe(listener: (envelope: string) => void): () => void;
  subscriberCount(): number;
  pushData(data: unknown): void;
  hasData(): boolean;
}

export interface PollerOptions {
  intervalMs: number | (() => number);
  task: () => Promise<unknown>;
  failThreshold?: number;
  backoffMs?: number;
  onStop?: () => void;
}

export function createPoller(opts: PollerOptions): PollerHandle {
  const failThreshold = opts.failThreshold ?? 5;
  const backoffMs = opts.backoffMs ?? 300_000;
  const listeners = new Set<(envelope: string) => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let stopped = false;
  let lastData: string | null = null;
  let failStreak = 0;
  let degraded = false;

  const emit = (envelope: string) => {
    for (const l of listeners) l(envelope);
  };

  const applyData = (data: unknown) => {
    const serialized = JSON.stringify({ type: 'data', data });
    if (serialized !== lastData) {
      lastData = serialized;
      emit(serialized);
    }
  };

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const data = await opts.task();
      failStreak = 0;
      if (degraded) {
        degraded = false;
        emit(JSON.stringify({ type: 'status', degraded: false }));
      }
      applyData(data);
    } catch (err) {
      failStreak += 1;
      degraded = true;
      emit(
        JSON.stringify({
          type: 'status',
          degraded: true,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      running = false;
      if (!stopped && listeners.size > 0) {
        const base = typeof opts.intervalMs === 'function' ? opts.intervalMs() : opts.intervalMs;
        const interval = failStreak >= failThreshold ? backoffMs : base;
        timer = setTimeout(tick, interval);
      }
    }
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (lastData !== null) listener(lastData);
      if (listeners.size === 1) {
        stopped = false;
        void tick();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stopped = true;
          if (timer) clearTimeout(timer);
          timer = null;
          opts.onStop?.();
        }
      };
    },
    subscriberCount() {
      return listeners.size;
    },
    pushData(data: unknown) {
      if (stopped) return;
      applyData(data);
    },
    hasData() {
      return lastData !== null;
    },
  };
}
