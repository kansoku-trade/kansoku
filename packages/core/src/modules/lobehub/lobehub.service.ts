import { LOBEHUB_PROVIDER } from "../../ai/lobehub/types.js";
import type { LobeHubApi } from "../../contract/lobehub.js";
import { lobehubDeps } from "./lobehub.deps.js";

export const lobehubService: LobeHubApi = {
  async startDeviceLogin() {
    return lobehubDeps().gateway.startDeviceLogin();
  },

  async pollDeviceLogin() {
    const deps = lobehubDeps();
    const result = await deps.gateway.pollDeviceLogin();
    if (result.status === "connected") await deps.models.refresh(LOBEHUB_PROVIDER);
    return result;
  },

  async getAccount() {
    return lobehubDeps().gateway.getAccount();
  },

  async getCredits() {
    return lobehubDeps().gateway.getCredits();
  },

  async deleteSession() {
    await lobehubDeps().gateway.logout();
    return { deleted: true };
  },
};
