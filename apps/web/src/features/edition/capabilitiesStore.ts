import { useSyncExternalStore } from 'react';
import type { LicenseSnapshot } from '@kansoku/core/contract/license';
import type { FeatureKey, FeatureState } from '@kansoku/pro-api/features';
import { client } from '../../lib/client';
import { clearLicenseRequired, useLicenseRequiredMode } from './licenseRequiredMode';

export interface Capabilities {
  pro: boolean | null;
  licensed: boolean;
  license?: LicenseSnapshot;
  features?: Record<FeatureKey, FeatureState>;
  hasEncBundle?: boolean;
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

export function refreshCapabilities(): Promise<Capabilities | null> {
  clearLicenseRequired();
  return client.capabilities
    .get()
    .then((data) => {
      capabilities = data;
      emit();
      return data;
    })
    .catch(() => null);
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
