import type { ActivateResult, LicenseSnapshot } from "./licenseState.js";
import { currentSnapshotSafe, isLicensed } from "./licenseGate.js";
import { getLicenseManager } from "./licenseState.js";
import { licenseKeySchema, parseClientInput } from "../platform/zodInput.js";

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
    return getLicenseManager().activate(parseClientInput(licenseKeySchema, key, '{"key":"..."}'));
  },

  async deactivate() {
    await getLicenseManager().deactivate();
    return { deactivated: true };
  },

  async isLicensed() {
    return isLicensed();
  },
};
