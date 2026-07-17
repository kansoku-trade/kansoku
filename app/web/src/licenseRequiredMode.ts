import { useSyncExternalStore } from "react";
import { openLicenseModal } from "./licenseModalStore";

let active = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function isLicenseRequiredErrorCode(status: number, code: string | undefined): boolean {
  return status === 403 && code === "LICENSE_REQUIRED";
}

export function markLicenseRequired(): void {
  if (active) return;
  active = true;
  emit();
  openLicenseModal("runtime-403");
}

export function clearLicenseRequired(): void {
  if (!active) return;
  active = false;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
  return active;
}

export function useLicenseRequiredMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function resetLicenseRequiredModeForTests(): void {
  active = false;
  listeners.clear();
}

export function subscribeForTests(listener: () => void): () => void {
  return subscribe(listener);
}

export function getLicenseRequiredModeSnapshotForTests(): boolean {
  return getSnapshot();
}
