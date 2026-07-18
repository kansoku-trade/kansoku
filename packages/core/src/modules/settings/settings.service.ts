import { getPro } from "../../pro/registry.js";
import { getActiveWatchedMarketsStore, validateWatchedMarkets } from "../../services/watchedMarketsStore.js";
import type { SettingsApi } from "../../contract/settings.js";
import { aiSettingsService } from "./aiSettings.service.js";

export const settingsService: SettingsApi = {
  getAi() {
    return aiSettingsService.getAi();
  },
  putRole(input) {
    return aiSettingsService.putRole(input);
  },
  deleteRole(input) {
    return aiSettingsService.deleteRole(input);
  },
  putCredential(input) {
    return aiSettingsService.putCredential(input);
  },
  deleteCredential(input) {
    return aiSettingsService.deleteCredential(input);
  },
  getCatalog() {
    return aiSettingsService.getCatalog();
  },
  testConnection(input) {
    return aiSettingsService.testConnection(input);
  },
  getUsageToday() {
    return aiSettingsService.getUsageToday();
  },
  resetCredentials() {
    return aiSettingsService.resetCredentials();
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
