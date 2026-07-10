import { useSyncExternalStore } from "react";

export interface RestrictedModeState {
  restricted: boolean;
  dismissed: boolean;
}

let state: RestrictedModeState = { restricted: false, dismissed: false };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function markRestricted(): void {
  if (state.restricted) return;
  state = { ...state, restricted: true };
  emit();
}

export function clearRestricted(): void {
  if (!state.restricted && !state.dismissed) return;
  state = { restricted: false, dismissed: false };
  emit();
}

export function dismissRestrictedBanner(): void {
  if (state.dismissed) return;
  state = { ...state, dismissed: true };
  emit();
}

export function isCredentialsErrorCode(status: number, code: string | undefined): boolean {
  return status === 503 && (code === "NO_CREDENTIALS" || code === "CREDENTIALS_REJECTED");
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): RestrictedModeState {
  return state;
}

export function useRestrictedMode(): RestrictedModeState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function resetRestrictedModeForTests(): void {
  state = { restricted: false, dismissed: false };
  listeners.clear();
}

export function subscribeForTests(listener: () => void): () => void {
  return subscribe(listener);
}

export function getRestrictedModeSnapshotForTests(): RestrictedModeState {
  return getSnapshot();
}
