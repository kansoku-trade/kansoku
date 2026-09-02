import { getSupportedThinkingLevels } from '@earendil-works/pi-ai';
import type { AiRole, AiSettingsService, AiUsageRecord, RoleSettingOut } from '@kansoku/pro-api';
import { SINGLE_KEY_PROVIDERS } from '../ai/runtime/modelsRuntime.js';
import { LOBEHUB_PROVIDER } from '../ai/lobehub/types.js';
import { applyBaseUrlOverride } from '../ai/runtime/providerOverrides.js';
import { listUsage } from '../ai/runtime/usageStore.js';
import { ClientError } from '../platform/errors.js';
import { parseClientInput } from '../platform/zodInput.js';
import { z } from 'zod';
import { easternDate } from '../marketdata/session.js';
import { settingsDeps } from './settings.deps.js';
import { runTestConnection } from './settings.testConnection.js';
import {
  allowedProviders,
  CODEX_PROVIDER,
  parseRole,
  ROLES,
  validateRoleSetting,
} from './settingsValidation.js';

const credentialKeySchema = z.string().min(1);
const httpUrlSchema = z
  .string()
  .trim()
  .transform((trimmed) => {
    if (!trimmed) return null;
    const stripped = trimmed.replace(/\/+$/, '');
    let url: URL;
    try {
      url = new URL(stripped);
    } catch {
      throw new ClientError(`invalid baseUrl: ${stripped}`, 'expected a full http(s) URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new ClientError(`invalid baseUrl: ${stripped}`, 'expected a full http(s) URL');
    }
    return stripped;
  });

function normalizeProviderBaseUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  return parseClientInput(httpUrlSchema, raw);
}

function usageRole(
  record: AiUsageRecord,
): 'comment' | 'analyst' | 'deepDive' | 'chat' | 'casePick' | 'title' | null {
  switch (record.layer) {
    case 'commentator':
    case 'event-filter':
    case 'chat-suggest': {
      return 'comment';
    }
    case 'analyst': {
      return record.origin === 'deep-dive' ? 'deepDive' : 'analyst';
    }
    case 'chat':
    case 'research-chat': {
      return 'chat';
    }
    case 'research-refresh': {
      return 'deepDive';
    }
    case 'case-pick': {
      return 'casePick';
    }
    case 'session-title': {
      return 'title';
    }
    default: {
      return null;
    }
  }
}

export const aiSettingsService: AiSettingsService = {
  async getAi() {
    const { settingsStore, credentials, secretBox, models } = settingsDeps();
    const rolesOut = {} as Record<AiRole, RoleSettingOut>;
    for (const role of ROLES) {
      const setting = settingsStore.getRole(role);
      const stale =
        setting.mode === 'custom' &&
        !models.getModel(setting.provider ?? '', setting.modelId ?? '');
      rolesOut[role] = { ...setting, stale };
    }
    return {
      roles: rolesOut,
      credentials: credentials.listEntries(),
      masterKey: secretBox.status(),
      endpoints: credentials.listBaseUrls(),
    };
  },

  async putRole(input) {
    const { settingsStore, models } = settingsDeps();
    const role = parseRole(input.role);
    const setting = validateRoleSetting(role, input, models);
    settingsStore.setRole(role, setting);
    return { role, ...settingsStore.getRole(role) };
  },

  async deleteRole(input) {
    const { settingsStore } = settingsDeps();
    const role = parseRole(input.role);
    settingsStore.setRole(role, {
      mode: 'disabled',
      provider: null,
      modelId: null,
      thinkingLevel: null,
    });
    return { role, mode: 'disabled' };
  },

  async putCredential(input) {
    const { credentials } = settingsDeps();
    const provider = input.provider;
    if (provider === CODEX_PROVIDER) {
      throw new ClientError(
        `cannot set an api key for ${CODEX_PROVIDER}`,
        'managed by codex CLI login',
      );
    }
    if (!SINGLE_KEY_PROVIDERS.has(provider)) {
      throw new ClientError(
        `unknown provider: ${provider}`,
        `expected one of ${[...SINGLE_KEY_PROVIDERS].join(', ')}`,
      );
    }
    const keyResult = credentialKeySchema.safeParse(input.key);
    if (!keyResult.success) throw new ClientError('"key" must be a non-empty string');
    const key = keyResult.data;
    credentials.setApiKey(provider, key);
    const entry = credentials.listEntries().find((e) => e.provider === provider);
    return { provider, masked: entry?.masked ?? null };
  },

  async putProviderBaseUrl(input) {
    const { credentials, models } = settingsDeps();
    const provider = input.provider;
    if (!SINGLE_KEY_PROVIDERS.has(provider)) {
      throw new ClientError(
        `unknown provider: ${provider}`,
        `expected one of ${[...SINGLE_KEY_PROVIDERS].join(', ')}`,
      );
    }
    const normalized = normalizeProviderBaseUrl(input.baseUrl);
    credentials.setBaseUrl(provider, normalized);
    applyBaseUrlOverride(models, provider, normalized);
    return { provider, baseUrl: normalized };
  },

  async deleteCredential(input) {
    const { credentials, models } = settingsDeps();
    try {
      await credentials.delete(input.provider);
    } catch (err) {
      const hint = input.provider === CODEX_PROVIDER ? 'managed by codex CLI login' : undefined;
      throw new ClientError(err instanceof Error ? err.message : String(err), hint);
    }
    applyBaseUrlOverride(models, input.provider, null);
    return { provider: input.provider, deleted: true };
  },

  async getCatalog() {
    const { credentials, lobehub, models } = settingsDeps();
    const refreshResult = await models.refresh({ force: true });
    const refreshError = refreshResult.errors.get(LOBEHUB_PROVIDER);
    if (refreshError) {
      console.warn(`settings: using cached LobeHub model catalog: ${String(refreshError)}`);
    }
    const configuredApiKey = new Set(
      credentials
        .listEntries()
        .filter((e) => e.ok)
        .map((e) => e.provider),
    );
    const providers = [];
    for (const id of allowedProviders()) {
      const provider = models.getProvider(id);
      const name = provider?.name ?? id;
      const modelList = (provider?.getModels() ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        thinkingLevels: getSupportedThinkingLevels(m),
      }));

      let auth: { kind: 'api_key' | 'oauth'; status: 'configured' | 'missing' | 'error' };
      if (id === LOBEHUB_PROVIDER) {
        try {
          const account = await lobehub.getAccount();
          auth = {
            kind: 'oauth',
            status:
              account.status === 'connected'
                ? 'configured'
                : account.status === 'refresh_required'
                  ? 'error'
                  : 'missing',
          };
        } catch {
          auth = { kind: 'oauth', status: 'error' };
        }
      } else if (id === CODEX_PROVIDER) {
        try {
          const credential = await credentials.read(CODEX_PROVIDER);
          auth = { kind: 'oauth', status: credential ? 'configured' : 'missing' };
        } catch {
          auth = { kind: 'oauth', status: 'error' };
        }
      } else {
        auth = { kind: 'api_key', status: configuredApiKey.has(id) ? 'configured' : 'missing' };
      }

      providers.push({ id, name, auth, models: modelList });
    }
    return { providers };
  },

  async testConnection(input) {
    return runTestConnection(input, settingsDeps());
  },

  async getUsageToday() {
    const { db } = settingsDeps();
    const records = await listUsage(easternDate(new Date()), db);
    const roles = {
      comment: { calls: 0, cost: 0 },
      analyst: { calls: 0, cost: 0 },
      deepDive: { calls: 0, cost: 0 },
      chat: { calls: 0, cost: 0 },
      casePick: { calls: 0, cost: 0 },
      title: { calls: 0, cost: 0 },
    };
    const total = { calls: 0, cost: 0 };
    for (const record of records) {
      total.calls += record.calls;
      total.cost += record.cost_total;
      const role = usageRole(record);
      if (!role) continue;
      roles[role].calls += record.calls;
      roles[role].cost += record.cost_total;
    }
    return { roles, total };
  },

  async resetCredentials() {
    const { db, credentials, secretBox, models } = settingsDeps();
    db.transaction(() => {
      credentials.wipeAll();
    });
    secretBox.resetKey();
    for (const provider of SINGLE_KEY_PROVIDERS) {
      applyBaseUrlOverride(models, provider, null);
    }
    return { reset: true };
  },
};
