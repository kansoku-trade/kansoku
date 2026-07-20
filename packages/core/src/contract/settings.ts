import type {
  AiRole,
  CatalogProvider,
  RoleSetting,
  SettingsAiOut,
  TestConnectionResult,
  UsageTodayOut,
} from '@kansoku/pro-api';
import type { Market } from '../symbols/symbol.utils.js';
import { defineRoutes } from './defineRoutes.js';

export type {
  CatalogModel,
  CatalogProvider,
  RoleSettingOut,
  SettingsAiOut,
  TestConnectionResult,
  UsageTodayOut,
} from '@kansoku/pro-api';

export interface SettingsApi {
  getAi(): Promise<SettingsAiOut>;
  putRole(input: {
    role: string;
    mode?: unknown;
    provider?: unknown;
    modelId?: unknown;
    thinkingLevel?: unknown;
  }): Promise<{ role: AiRole } & RoleSetting>;
  deleteRole(input: { role: string }): Promise<{ role: AiRole; mode: 'disabled' }>;
  putCredential(input: {
    provider: string;
    key?: unknown;
  }): Promise<{ provider: string; masked: string | null }>;
  deleteCredential(input: { provider: string }): Promise<{ provider: string; deleted: true }>;
  getCatalog(): Promise<{ providers: CatalogProvider[] }>;
  testConnection(input: Record<string, unknown>): Promise<TestConnectionResult>;
  getUsageToday(): Promise<UsageTodayOut>;
  resetCredentials(): Promise<{ reset: true }>;
  getWatchedMarkets(): Promise<{ markets: Market[] }>;
  putWatchedMarkets(input: { markets: unknown }): Promise<{ markets: Market[] }>;
  getSubscribeUrl(): Promise<{
    subscribeUrl: string | null;
    priceLabel: string | null;
    trialDays: number | null;
    yearly: {
      subscribeUrl: string;
      priceLabel: string | null;
      trialDays: number | null;
      savingsLabel: string | null;
    } | null;
  }>;
}

export const settingsRoutes = defineRoutes<SettingsApi>('settings', {
  getAi: { method: 'GET', path: '/ai' },
  putRole: { method: 'PUT', path: '/ai/roles/:role' },
  deleteRole: { method: 'DELETE', path: '/ai/roles/:role' },
  putCredential: { method: 'PUT', path: '/ai/credentials/:provider' },
  deleteCredential: { method: 'DELETE', path: '/ai/credentials/:provider' },
  getCatalog: { method: 'GET', path: '/ai/catalog' },
  testConnection: { method: 'POST', path: '/ai/test' },
  getUsageToday: { method: 'GET', path: '/ai/usage-today' },
  resetCredentials: { method: 'POST', path: '/ai/reset-credentials' },
  getWatchedMarkets: { method: 'GET', path: '/watched-markets' },
  putWatchedMarkets: { method: 'PUT', path: '/watched-markets' },
  getSubscribeUrl: { method: 'GET', path: '/subscribe-url' },
});
