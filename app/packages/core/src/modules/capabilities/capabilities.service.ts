import type { CapabilitiesApi } from "../../contract/capabilities.js";
import { isProPresent } from "../../pro/registry.js";

export const capabilitiesService: CapabilitiesApi = {
  async get() {
    const pro = isProPresent();
    return { pro, licensed: pro };
  },
};
