import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetProviderOverridesForTests } from '../src/ai/runtime/providerOverrides.js';
import { createCredentialStore, type AppCredentialStore } from '../src/ai/settings/credentialStore.js';
import { createSecretBox, type SecretBox } from '../src/ai/settings/secretBox.js';
import { createSettingsStore } from '../src/ai/settings/settingsStore.js';
import { createDb, type Db } from '../src/db/index.js';
import { createWatchedMarketsStore } from '../src/marketdata/watchedMarketsStore.js';
import { ClientError } from '../src/platform/errors.js';
import { aiSettingsService } from '../src/settings/aiSettings.service.js';
import { setSettingsDepsForTests } from '../src/settings/settings.deps.js';

function tempDb(): { dir: string; db: Db } {
  const dir = mkdtempSync(join(tmpdir(), 'ai-settings-service-'));
  return { dir, db: createDb(join(dir, 'app.db')) };
}

describe('aiSettingsService', () => {
  let dir: string;
  let db: Db;
  let secretBox: SecretBox;
  let credentials: AppCredentialStore;
  let models: ReturnType<typeof builtinModels>;

  beforeEach(() => {
    const t = tempDb();
    dir = t.dir;
    db = t.db;
    secretBox = createSecretBox(join(dir, 'master.key'));
    credentials = createCredentialStore(db, secretBox, { codexAuthPath: join(dir, 'auth.json') });
    models = builtinModels();
    resetProviderOverridesForTests();
    setSettingsDepsForTests({
      settingsStore: createSettingsStore(db),
      watchedMarketsStore: createWatchedMarketsStore(db),
      credentials,
      secretBox,
      models,
      db,
    });
  });

  afterEach(() => {
    setSettingsDepsForTests(null);
    resetProviderOverridesForTests();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('putProviderBaseUrl', () => {
    it('normalizes a valid url, persists it, and applies it to the live provider', async () => {
      const openaiModelId = models.getModels('openai')[0]?.id;
      if (!openaiModelId) throw new Error('fixture: no openai model in catalog');

      const result = await aiSettingsService.putProviderBaseUrl({
        provider: 'openai',
        baseUrl: 'https://relay.example.com/v1//',
      });

      expect(result).toEqual({ provider: 'openai', baseUrl: 'https://relay.example.com/v1' });
      expect(credentials.listBaseUrls()).toEqual([
        { provider: 'openai', baseUrl: 'https://relay.example.com/v1' },
      ]);
      expect(models.getModel('openai', openaiModelId)?.baseUrl).toBe(
        'https://relay.example.com/v1',
      );
    });

    it('treats an empty or whitespace-only baseUrl as a clear, restoring the official url', async () => {
      const officialBaseUrl = models.getProvider('deepseek')?.baseUrl;
      await aiSettingsService.putProviderBaseUrl({
        provider: 'deepseek',
        baseUrl: 'https://relay.example.com/v1',
      });

      const result = await aiSettingsService.putProviderBaseUrl({
        provider: 'deepseek',
        baseUrl: '   ',
      });

      expect(result).toEqual({ provider: 'deepseek', baseUrl: null });
      expect(credentials.listBaseUrls()).toEqual([]);
      expect(models.getProvider('deepseek')?.baseUrl).toBe(officialBaseUrl);
    });

    it('rejects an unparseable url and leaves no record', async () => {
      await expect(
        aiSettingsService.putProviderBaseUrl({ provider: 'deepseek', baseUrl: 'not-a-url' }),
      ).rejects.toThrow(ClientError);
      expect(credentials.listBaseUrls()).toEqual([]);
    });

    it('rejects a non-http(s) protocol and leaves no record', async () => {
      await expect(
        aiSettingsService.putProviderBaseUrl({ provider: 'deepseek', baseUrl: 'ftp://x' }),
      ).rejects.toThrow(ClientError);
      expect(credentials.listBaseUrls()).toEqual([]);
    });

    it('rejects an unknown provider', async () => {
      await expect(
        aiSettingsService.putProviderBaseUrl({
          provider: 'not-a-provider',
          baseUrl: 'https://x.example',
        }),
      ).rejects.toThrow(ClientError);
    });

    it('rejects openai-codex', async () => {
      await expect(
        aiSettingsService.putProviderBaseUrl({
          provider: 'openai-codex',
          baseUrl: 'https://x.example',
        }),
      ).rejects.toThrow(ClientError);
    });
  });

  describe('getAi', () => {
    it('reports endpoints from listBaseUrls', async () => {
      await aiSettingsService.putProviderBaseUrl({
        provider: 'openai',
        baseUrl: 'https://relay.example.com/v1',
      });

      const out = await aiSettingsService.getAi();

      expect(out.endpoints).toEqual([{ provider: 'openai', baseUrl: 'https://relay.example.com/v1' }]);
    });
  });

  describe('deleteCredential', () => {
    it('restores the official baseUrl on the live provider after deletion', async () => {
      const officialBaseUrl = models.getProvider('openai')?.baseUrl;
      credentials.setApiKey('openai', 'sk-test');
      await aiSettingsService.putProviderBaseUrl({
        provider: 'openai',
        baseUrl: 'https://relay.example.com/v1',
      });

      await aiSettingsService.deleteCredential({ provider: 'openai' });

      expect(models.getProvider('openai')?.baseUrl).toBe(officialBaseUrl);
      expect(credentials.listBaseUrls()).toEqual([]);
    });
  });
});
