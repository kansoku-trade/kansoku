import { useMemo, useRef, useSyncExternalStore } from "react";
import { createSaveQueue, type SaveQueue } from "./saveQueue";

interface Snapshot<T> {
  flushing: boolean;
  pending: T | null;
  confirmed: T | null;
}

export function useSaveQueue<T>(opts: {
  save: (snapshot: T) => Promise<T | void>;
  initial: T | null;
  onError?: (err: unknown, rolledBackTo: T | null, retrySnapshot: T) => void;
}): SaveQueue<T> {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const queue = useMemo(
    () =>
      createSaveQueue<T>({
        save: (snapshot) => optsRef.current.save(snapshot),
        initial: opts.initial,
        onError: (err, rolledBackTo, retrySnapshot) =>
          optsRef.current.onError?.(err, rolledBackTo, retrySnapshot),
      }),
    [],
  );

  const readSnapshot = (): Snapshot<T> => ({
    flushing: queue.flushing(),
    pending: queue.pending(),
    confirmed: queue.confirmed(),
  });
  const snapshotRef = useRef<Snapshot<T>>(readSnapshot());

  const subscribe = useMemo(
    () => (listener: () => void) =>
      queue.subscribe(() => {
        snapshotRef.current = readSnapshot();
        listener();
      }),
    [queue],
  );

  useSyncExternalStore(subscribe, () => snapshotRef.current, () => snapshotRef.current);

  return queue;
}
