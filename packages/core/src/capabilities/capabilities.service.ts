import { currentSnapshotSafe, isLicensed } from '../license/licenseGate.js';
import type { CapabilitiesApi } from '../contract/capabilities.js';
import { featureStates } from '../pro/features.js';
import { getPro, hasEncBundle } from '../pro/registry.js';

export const capabilitiesService: CapabilitiesApi = {
  async get() {
    return {
      pro: getPro() != null,
      licensed: isLicensed(),
      license: currentSnapshotSafe(),
      features: await featureStates(),
      hasEncBundle: hasEncBundle(),
    };
  },
};
