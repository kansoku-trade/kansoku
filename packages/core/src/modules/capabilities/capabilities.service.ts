import type { CapabilitiesApi } from '../../contract/capabilities.js';
import { featureStates } from '../../pro/features.js';
import { getPro } from '../../pro/registry.js';

export const capabilitiesService: CapabilitiesApi = {
  async get() {
    const pro = getPro();
    const features = await featureStates();
    if (!pro?.license) return { pro: pro != null, licensed: false, features };
    const [licensed, license] = await Promise.all([pro.license.isLicensed(), pro.license.status()]);
    return { pro: true, licensed, license, features };
  },
};
