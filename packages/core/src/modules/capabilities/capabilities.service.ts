import type { CapabilitiesApi } from "../../contract/capabilities.js";
import { getPro } from "../../pro/registry.js";

export const capabilitiesService: CapabilitiesApi = {
  async get() {
    const pro = getPro();
    if (!pro?.license) return { pro: pro != null, licensed: false };
    const [licensed, license] = await Promise.all([pro.license.isLicensed(), pro.license.status()]);
    return { pro: true, licensed, license };
  },
};
