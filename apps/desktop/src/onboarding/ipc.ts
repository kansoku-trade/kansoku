import { ipcMain } from 'electron';
import type { OnboardingStore } from './store.js';

// Same privileged-origin gate as credentials: the preload only
// exposes desktop.onboarding to app:// (and the dev renderer), so these
// handlers don't re-check the sender.
export function registerOnboardingIpc(store: OnboardingStore): void {
  ipcMain.handle('desktop:onboarding:get-state', () => store.getState());
  ipcMain.handle('desktop:onboarding:complete', () => store.complete());
}
