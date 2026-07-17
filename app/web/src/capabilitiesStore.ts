import { useSyncExternalStore } from "react";
import { client } from "./client";

export interface Capabilities {
  pro: boolean;
  licensed: boolean;
}

const DEFAULT: Capabilities = { pro: true, licensed: true };

let capabilities: Capabilities = DEFAULT;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function ensureLoaded(): void {
  if (inflight) return;
  inflight = client.capabilities
    .get()
    .then((data) => {
      capabilities = data;
      emit();
    })
    .catch(() => {});
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Capabilities {
  return capabilities;
}

export function useCapabilities(): Capabilities {
  ensureLoaded();
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function resetCapabilitiesStoreForTests(): void {
  capabilities = DEFAULT;
  inflight = null;
  listeners.clear();
}
