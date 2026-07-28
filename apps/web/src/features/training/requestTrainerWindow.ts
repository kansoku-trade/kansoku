import type { OpenTrainerBridge } from '../desktop/desktopWindowsBridge';
import { openLicenseModal } from '../edition/licenseModalStore';

export function requestTrainerWindow(
  bridge: OpenTrainerBridge | null,
  capabilities: { pro: boolean | null; licensed: boolean },
): void {
  if (!bridge || capabilities.pro === null) return;
  if (capabilities.pro && capabilities.licensed) {
    void bridge.openTrainer();
    return;
  }
  openLicenseModal('guard');
}
