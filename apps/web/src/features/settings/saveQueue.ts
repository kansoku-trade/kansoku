export interface SaveQueue<T> {
  push(snapshot: T): void;
  flushing(): boolean;
  pending(): T | null;
  confirmed(): T | null;
  subscribe(listener: () => void): () => void;
}

export function createSaveQueue<T>(opts: {
  save: (snapshot: T) => Promise<T | void>;
  initial: T | null;
  onError?: (err: unknown, rolledBackTo: T | null, retrySnapshot: T) => void;
}): SaveQueue<T> {
  let confirmed = opts.initial;
  let pending: T | null = null;
  let flushing = false;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const run = (snapshot: T) => {
    flushing = true;
    notify();
    opts.save(snapshot).then(
      (result) => {
        confirmed = result === undefined ? snapshot : result;
        const next = pending;
        pending = null;
        notify();
        if (next !== null) {
          run(next);
        } else {
          flushing = false;
          notify();
        }
      },
      (err) => {
        const retrySnapshot = pending ?? snapshot;
        pending = null;
        flushing = false;
        notify();
        opts.onError?.(err, confirmed, retrySnapshot);
      },
    );
  };

  return {
    push(snapshot: T) {
      if (flushing) {
        pending = snapshot;
        notify();
        return;
      }
      run(snapshot);
    },
    flushing() {
      return flushing;
    },
    pending() {
      return pending;
    },
    confirmed() {
      return confirmed;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
