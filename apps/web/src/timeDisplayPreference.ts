import { useSyncExternalStore } from 'react';

export type TimeDisplayPreference = 'market' | 'local';

export const DEFAULT_TIME_DISPLAY_PREFERENCE: TimeDisplayPreference = 'market';
export const TIME_DISPLAY_PREFERENCE_STORAGE_KEY = 'trade.time-display-preference';

type ReadableStorage = Pick<Storage, 'getItem'>;

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readTimeDisplayPreference(
  storage: ReadableStorage | null = browserStorage(),
): TimeDisplayPreference {
  if (!storage) return DEFAULT_TIME_DISPLAY_PREFERENCE;
  try {
    return storage.getItem(TIME_DISPLAY_PREFERENCE_STORAGE_KEY) === 'local' ? 'local' : 'market';
  } catch {
    return DEFAULT_TIME_DISPLAY_PREFERENCE;
  }
}

let preference = readTimeDisplayPreference();
const listeners = new Set<() => void>();
let listeningForStorageChanges = false;

function emit(): void {
  for (const listener of listeners) listener();
}

function handleStorageChange(event: StorageEvent): void {
  if (event.key !== TIME_DISPLAY_PREFERENCE_STORAGE_KEY) return;
  const next = event.newValue === 'local' ? 'local' : 'market';
  if (next === preference) return;
  preference = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!listeningForStorageChanges && typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageChange);
    listeningForStorageChanges = true;
  }
  return () => listeners.delete(listener);
}

export function getTimeDisplayPreference(): TimeDisplayPreference {
  return preference;
}

export function setTimeDisplayPreference(next: TimeDisplayPreference): void {
  if (next === preference) return;
  preference = next;
  try {
    browserStorage()?.setItem(TIME_DISPLAY_PREFERENCE_STORAGE_KEY, next);
  } catch {
    // The preference still applies for this session when storage is unavailable.
  }
  emit();
}

export function useTimeDisplayPreference(): TimeDisplayPreference {
  return useSyncExternalStore(
    subscribe,
    getTimeDisplayPreference,
    () => DEFAULT_TIME_DISPLAY_PREFERENCE,
  );
}
