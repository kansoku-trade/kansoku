// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetCapabilitiesStoreForTests } from '@web/features/edition/capabilitiesStore';
import { resetLicenseModalStoreForTests } from '@web/features/edition/licenseModalStore';
import type { AiSettings, Catalog, RoleSetting } from './types';

const getAi = vi.fn();
const getCatalog = vi.fn();
const getUsageToday = vi.fn();
const getWatchedMarkets = vi.fn();
const getSubscribeUrl = vi.fn();
const credentialsStatus = vi.fn();
const capabilitiesGet = vi.fn();
const lobehubGetAccount = vi.fn();
const lobehubGetCredits = vi.fn();

vi.mock('@web/lib/client', () => ({
  client: {
    settings: {
      getAi: (...args: unknown[]) => getAi(...args),
      getCatalog: (...args: unknown[]) => getCatalog(...args),
      getUsageToday: (...args: unknown[]) => getUsageToday(...args),
      getWatchedMarkets: (...args: unknown[]) => getWatchedMarkets(...args),
      getSubscribeUrl: (...args: unknown[]) => getSubscribeUrl(...args),
    },
    credentials: {
      status: (...args: unknown[]) => credentialsStatus(...args),
    },
    capabilities: {
      get: (...args: unknown[]) => capabilitiesGet(...args),
    },
    lobehub: {
      getAccount: (...args: unknown[]) => lobehubGetAccount(...args),
      getCredits: (...args: unknown[]) => lobehubGetCredits(...args),
    },
  },
}));

const { SettingsPage } = await import('./SettingsPage');

const disabled: RoleSetting = { mode: 'disabled', provider: null, modelId: null, thinkingLevel: null, stale: false };

// The 'memory' role shipped 2026-07-20 (aa9bb43). A settings.getAi response
// restored from react-query's localStorage persistence (queryClient.ts) can
// still carry a pre-'memory' role set from before that release.
const preMemoryRoleSettings: AiSettings = {
  roles: {
    primary: disabled,
    comment: disabled,
    analyst: disabled,
    deepDive: disabled,
    chat: disabled,
  } as AiSettings['roles'],
  credentials: [],
  masterKey: 'missing',
};

const catalog: Catalog = { providers: [] };

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

describe('SettingsPage', () => {
  afterEach(() => {
    cleanup();
    resetCapabilitiesStoreForTests();
    resetLicenseModalStoreForTests();
    for (const mock of [
      getAi,
      getCatalog,
      getUsageToday,
      getWatchedMarkets,
      getSubscribeUrl,
      credentialsStatus,
      capabilitiesGet,
      lobehubGetAccount,
      lobehubGetCredits,
    ]) {
      mock.mockReset();
    }
  });

  it('renders without crashing when the settings.getAi response is missing a role added after the client last cached it', async () => {
    getAi.mockResolvedValue(preMemoryRoleSettings);
    getCatalog.mockResolvedValue(catalog);
    getUsageToday.mockResolvedValue({
      roles: {
        comment: { calls: 0, cost: 0 },
        analyst: { calls: 0, cost: 0 },
        deepDive: { calls: 0, cost: 0 },
        chat: { calls: 0, cost: 0 },
        memory: { calls: 0, cost: 0 },
      },
      total: { calls: 0, cost: 0 },
    });
    getWatchedMarkets.mockResolvedValue({ markets: ['US'] });
    getSubscribeUrl.mockResolvedValue({ subscribeUrl: null });
    credentialsStatus.mockResolvedValue({ configured: false, path: null });
    capabilitiesGet.mockResolvedValue({ pro: false, licensed: false, license: { state: 'unlicensed' } });
    lobehubGetAccount.mockResolvedValue({
      status: 'disconnected',
      email: null,
      name: null,
      userId: null,
      updatedAt: null,
      baseUrl: '',
    });
    lobehubGetCredits.mockResolvedValue(null);

    renderWithClient(<SettingsPage />);

    expect(await screen.findByText('记忆整理')).toBeTruthy();
  });
});
