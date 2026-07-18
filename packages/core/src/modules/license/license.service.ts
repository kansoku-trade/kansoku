import type { ActivateResult, LicenseSnapshot } from "../../license/licenseState.js";
import { currentSnapshotSafe, isLicensed } from "../../license/licenseGate.js";
import { getLicenseManager } from "../../license/licenseState.js";

export interface LicenseServiceApi {
  status(): Promise<LicenseSnapshot>;
  activate(key: string): Promise<ActivateResult>;
  deactivate(): Promise<{ deactivated: true }>;
  isLicensed(): Promise<boolean>;
}

export const licenseService: LicenseServiceApi = {
  async status() {
    return currentSnapshotSafe();
  },

  async activate(key) {
    return getLicenseManager().activate(key);
  },

  async deactivate() {
    await getLicenseManager().deactivate();
    return { deactivated: true };
  },

  async isLicensed() {
    return isLicensed();
  },
};
