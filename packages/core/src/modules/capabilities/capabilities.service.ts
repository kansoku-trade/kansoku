import type { CapabilitiesApi } from "../../contract/capabilities.js";
import { getPro } from "../../pro/registry.js";
import { currentSnapshotSafe, isLicensed } from "../../license/licenseGate.js";

export const capabilitiesService: CapabilitiesApi = {
  async get() {
    return { pro: getPro() != null, licensed: isLicensed(), license: currentSnapshotSafe() };
  },
};
