import { useEffect, useRef, useState } from "react";
import { subscribeChannel, type ChannelSpec } from "./wsHub";
import { loadSnapshot, saveSnapshot } from "./wsSnapshot";

interface Envelope {
  type: "data" | "status";
  data?: unknown;
  degraded?: boolean;
}

export interface WsChannelState {
  degraded: boolean;
  connected: boolean;
  snapshotAt: number | null;
}

export function useWsChannel<T>(spec: ChannelSpec | null, onData: (data: T) => void): WsChannelState {
  const [degraded, setDegraded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [snapshotAt, setSnapshotAt] = useState<number | null>(null);
  const handler = useRef(onData);
  handler.current = onData;
  const specKey = spec ? JSON.stringify(spec) : null;

  useEffect(() => {
    if (!specKey) return;
    const parsedSpec = JSON.parse(specKey) as ChannelSpec;

    const snapshot = loadSnapshot(parsedSpec);
    if (snapshot) {
      handler.current(snapshot.data as T);
      setSnapshotAt(snapshot.at);
    } else {
      setSnapshotAt(null);
    }

    const off = subscribeChannel(
      parsedSpec,
      (payload) => {
        const env = payload as Envelope;
        if (env?.type === "data") {
          setDegraded(false);
          setSnapshotAt(null);
          saveSnapshot(parsedSpec, env.data);
          handler.current(env.data as T);
        } else if (env?.type === "status") {
          setDegraded(Boolean(env.degraded));
        }
      },
      setConnected,
    );
    return () => {
      off();
      setConnected(false);
      setDegraded(false);
    };
  }, [specKey]);

  return { degraded, connected, snapshotAt };
}
