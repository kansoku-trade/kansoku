import { resolveSubscription } from '../license/subscription.js';
import { clearLongbridgeEndpointCacheForPreferenceChange } from '../marketdata/longbridgeEndpoints.js';
import {
  getActiveLongbridgeRegionStore,
  validateLongbridgeRegionPreference,
} from '../marketdata/longbridgeRegionStore.js';
import {
  getActiveWatchedMarketsStore,
  validateWatchedMarkets,
} from '../marketdata/watchedMarketsStore.js';
import type { SettingsApi } from '../contract/settings.js';
import { aiSettingsService } from './aiSettings.service.js';

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
  putProviderBaseUrl(input) {
    return aiSettingsService.putProviderBaseUrl(input);
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

  async getLongbridgeRegion() {
    return { region: getActiveLongbridgeRegionStore().get() };
  },

  async putLongbridgeRegion(input) {
    const store = getActiveLongbridgeRegionStore();
    store.set(validateLongbridgeRegionPreference(input.region));
    clearLongbridgeEndpointCacheForPreferenceChange();
    return { region: store.get() };
  },

  async getSubscribeUrl() {
    const subscription = resolveSubscription();
    return {
      subscribeUrl: subscription.url,
      priceLabel: subscription.priceLabel,
      listPriceLabel: subscription.listPriceLabel,
      discountLabel: subscription.discountLabel,
      trialDays: subscription.trialDays,
      yearly: {
        subscribeUrl: subscription.yearly.url,
        priceLabel: subscription.yearly.priceLabel,
        listPriceLabel: subscription.yearly.listPriceLabel,
        discountLabel: subscription.yearly.discountLabel,
        trialDays: subscription.yearly.trialDays,
        savingsLabel: subscription.yearly.savingsLabel,
      },
    };
  },
};
