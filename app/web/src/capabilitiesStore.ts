import { useSyncExternalStore } from "react";
import type { LicenseSnapshot } from "../../packages/core/src/contract/license.js";
import { client } from "./client";
import { clearLicenseRequired, useLicenseRequiredMode } from "./licenseRequiredMode";

export interface Capabilities {
  pro: boolean | null;
  licensed: boolean;
  license?: LicenseSnapshot;
}

const DEFAULT: Capabilities = { pro: null, licensed: false };

const RETRY_DELAY_MS = 5000;

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
    .catch(() => {
      inflight = null;
      setTimeout(ensureLoaded, RETRY_DELAY_MS);
    });
}

export function refreshCapabilities(): Promise<void> {
  clearLicenseRequired();
  return client.capabilities
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
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const licenseRequired = useLicenseRequiredMode();
  if (licenseRequired && snapshot.licensed) return { ...snapshot, licensed: false };
  return snapshot;
}

export function resetCapabilitiesStoreForTests(): void {
  capabilities = DEFAULT;
  inflight = null;
  listeners.clear();
}
