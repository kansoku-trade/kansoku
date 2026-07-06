export interface ChannelEmitter {
  listeners: Set<(envelope: string) => void>;
  lastEnvelope: string | null;
  degraded: boolean;
}

export function createEmitter(): ChannelEmitter {
  return { listeners: new Set(), lastEnvelope: null, degraded: false };
}

/** Sends a `{type:"data",data}` envelope, deduped against the last one sent. */
export function emitData(e: ChannelEmitter, data: unknown): void {
  const env = JSON.stringify({ type: "data", data });
  if (env === e.lastEnvelope) return;
  e.lastEnvelope = env;
  for (const l of e.listeners) l(env);
}

/** Sends a `{type:"status",degraded,...}` envelope on a degraded-state transition. */
export function emitStatus(e: ChannelEmitter, degraded: boolean, error?: string): void {
  if (e.degraded === degraded) return;
  e.degraded = degraded;
  const env = JSON.stringify({ type: "status", degraded, ...(error ? { error } : {}) });
  for (const l of e.listeners) l(env);
}

/** Replays the last-known state to a newly-attached listener. */
export function replay(e: ChannelEmitter, push: (envelope: string) => void): void {
  if (e.lastEnvelope) push(e.lastEnvelope);
  if (e.degraded) push(JSON.stringify({ type: "status", degraded: true }));
}
