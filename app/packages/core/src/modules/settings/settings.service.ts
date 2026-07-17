import { getPro } from "../../pro/registry.js";
import { getActiveWatchedMarketsStore, validateWatchedMarkets } from "../../services/watchedMarketsStore.js";
import type { SettingsApi } from "../../contract/settings.js";
import { ClientError } from "../../errors.js";

function aiSettings() {
  const svc = getPro()?.aiSettings;
  if (!svc) throw new ClientError("AI features are not available in this build", undefined, 404);
  return svc;
}

export const settingsService: SettingsApi = {
  getAi() {
    return aiSettings().getAi();
  },
  putRole(input) {
    return aiSettings().putRole(input);
  },
  deleteRole(input) {
    return aiSettings().deleteRole(input);
  },
  putCredential(input) {
    return aiSettings().putCredential(input);
  },
  deleteCredential(input) {
    return aiSettings().deleteCredential(input);
  },
  getCatalog() {
    return aiSettings().getCatalog();
  },
  testConnection(input) {
    return aiSettings().testConnection(input);
  },
  getUsageToday() {
    return aiSettings().getUsageToday();
  },
  resetCredentials() {
    return aiSettings().resetCredentials();
  },

  async getWatchedMarkets() {
    return { markets: getActiveWatchedMarketsStore().get() };
  },

  async putWatchedMarkets(input) {
    const store = getActiveWatchedMarketsStore();
    store.set(validateWatchedMarkets(input.markets));
    return { markets: store.get() };
  },

  async getSubscribeUrl() {
    const subscription = getPro()?.subscription;
    return {
      subscribeUrl: subscription?.url ?? null,
      priceLabel: subscription?.priceLabel ?? null,
    };
  },
};
