import { useSyncExternalStore } from 'react';
import { LicenseModalBody } from './LicenseModal';
import { openModal, resetModalStoreForTests } from './ui';

export type LicenseModalTrigger = 'guard' | 'runtime-403';

let closeFn: (() => void) | null = null;
let trigger: LicenseModalTrigger | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getTrigger(): LicenseModalTrigger | null {
  return trigger;
}

export function useLicenseModalTrigger(): LicenseModalTrigger | null {
  return useSyncExternalStore(subscribe, getTrigger);
}

export function openLicenseModal(nextTrigger: LicenseModalTrigger): void {
  trigger = nextTrigger;
  emit();
  if (closeFn) return;
  const close = openModal({
    title: '订阅与授权',
    panelClassName: 'license-modal-panel',
    body: (closeModal) => <LicenseModalBody close={closeModal} />,
    onClose: () => {
      if (closeFn !== close) return;
      closeFn = null;
      trigger = null;
      emit();
    },
  });
  closeFn = close;
}

export function closeLicenseModal(): void {
  const close = closeFn;
  closeFn = null;
  trigger = null;
  emit();
  close?.();
}

export function resetLicenseModalStoreForTests(): void {
  closeFn = null;
  trigger = null;
  listeners.clear();
  resetModalStoreForTests();
}

export function getLicenseModalStateForTests(): {
  open: boolean;
  trigger: LicenseModalTrigger | null;
} {
  return { open: closeFn !== null, trigger };
}
