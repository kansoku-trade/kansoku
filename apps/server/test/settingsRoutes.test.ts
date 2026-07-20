import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MutableModels } from '@earendil-works/pi-ai';
import { getSupportedThinkingLevels } from '@earendil-works/pi-ai';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCredentialStore, type AppCredentialStore } from '@kansoku/core/ai/settings/credentialStore';
import { SINGLE_KEY_PROVIDERS } from '@kansoku/core/ai/runtime/modelsRuntime';
import { createSecretBox, type SecretBox } from '@kansoku/core/ai/settings/secretBox';
import { createSettingsStore, type SettingsStore } from '@kansoku/core/ai/settings/settingsStore';
import {
  createWatchedMarketsStore,
  setActiveWatchedMarketsStore,
  type WatchedMarketsStore,
} from '@kansoku/core/marketdata/watchedMarketsStore';
import { createDb, type Db } from '@kansoku/core/db/index';
import { aiUsage, providerCredentials } from '@kansoku/core/db/schema';
import { setSettingsDepsForTests } from '@kansoku/core/settings/settings.deps';
import { easternDate } from '@kansoku/core/marketdata/session';
import { tsukiRequest } from './helpers.js';

const catalog = builtinModels();
const ANALYST_PROVIDER = 'anthropic';
const ANALYST_MODEL_ID = 'claude-sonnet-4-5';
const analystModel = catalog.getModel(ANALYST_PROVIDER, ANALYST_MODEL_ID);
if (!analystModel) throw new Error('fixture model anthropic/claude-sonnet-4-5 not in catalog');
const analystThinkingLevel = getSupportedThinkingLevels(analystModel)[0];

function stubModels(
  completeSimple: MutableModels['completeSimple'],
  credentials: AppCredentialStore,
): MutableModels {
  const base = builtinModels({ credentials });
  return {
    getProviders: base.getProviders.bind(base),
    getProvider: base.getProvider.bind(base),
    getModels: base.getModels.bind(base),
    getModel: base.getModel.bind(base),
    refresh: base.refresh.bind(base),
    checkAuth: base.checkAuth.bind(base),
    getAvailable: base.getAvailable.bind(base),
    login: base.login.bind(base),
    logout: base.logout.bind(base),
    getAuth: base.getAuth.bind(base),
    stream: base.stream.bind(base),
    complete: base.complete.bind(base),
    streamSimple: base.streamSimple.bind(base),
    completeSimple,
    setProvider: base.setProvider.bind(base),
    deleteProvider: base.deleteProvider.bind(base),
    clearProviders: base.clearProviders.bind(base),
  };
}

interface TestCtx {
  dir: string;
  db: Db;
  secretBox: SecretBox;
  credentials: AppCredentialStore;
  settingsStore: SettingsStore;
  watchedMarketsStore: WatchedMarketsStore;
  models: MutableModels;
}

function makeCtx(): TestCtx {
  const dir = mkdtempSync(join(tmpdir(), 'settings-routes-'));
  const db = createDb(join(dir, 'app.db'));
  const secretBox = createSecretBox(join(dir, 'master.key'));
  const codexAuthPath = join(dir, 'codex-auth.json');
  const credentials = createCredentialStore(db, secretBox, { codexAuthPath });
  const settingsStore = createSettingsStore(db);
  const watchedMarketsStore = createWatchedMarketsStore(db);
  const models = builtinModels({ credentials });
  return { dir, db, secretBox, credentials, settingsStore, watchedMarketsStore, models };
}

function applyCtx(
  ctx: TestCtx,
  overrides: Partial<TestCtx & { testTimeoutMs: number; models: MutableModels }> = {},
): void {
  setSettingsDepsForTests({
    settingsStore: ctx.settingsStore,
    watchedMarketsStore: ctx.watchedMarketsStore,
    credentials: ctx.credentials,
    secretBox: ctx.secretBox,
    models: overrides.models ?? ctx.models,
    db: ctx.db,
    testTimeoutMs: overrides.testTimeoutMs ?? 5_000,
  });
}

const BASE = '/api/settings';

async function get(path: string): Promise<Response> {
  return tsukiRequest(`${BASE}${path}`);
}

async function del(path: string): Promise<Response> {
  return tsukiRequest(`${BASE}${path}`, { method: 'DELETE' });
}

async function put(path: string, payload?: unknown): Promise<Response> {
  return tsukiRequest(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
}

async function post(path: string, payload?: unknown): Promise<Response> {
  return tsukiRequest(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

let ctx: TestCtx;

beforeEach(() => {
  ctx = makeCtx();
  applyCtx(ctx);
  setActiveWatchedMarketsStore(ctx.watchedMarketsStore);
});

afterEach(() => {
  setSettingsDepsForTests(null);
  rmSync(ctx.dir, { recursive: true, force: true });
});

describe('envelope', () => {
  it('GET /ai returns default roles, empty credentials, and a masterKey status, wrapped in {ok, data}', async () => {
    const res = await get('/ai');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.credentials).toEqual([]);
    expect(typeof body.data.masterKey).toBe('string');
    expect(body.data.roles.primary).toMatchObject({ mode: 'disabled', stale: false });
    expect(body.data.roles.chat).toMatchObject({ mode: 'inherit', stale: false });
    expect(body.data.roles.comment).toMatchObject({ mode: 'inherit', stale: false });
    expect(body.data.roles.analyst).toMatchObject({ mode: 'inherit', stale: false });
    expect(body.data.roles.deepDive).toMatchObject({ mode: 'inherit', stale: false });
    expect(body.data.roles.memory).toMatchObject({ mode: 'inherit', stale: false });
  });
});

describe('PUT/DELETE /ai/roles/:role', () => {
  it('rejects an unknown role', async () => {
    const res = await put('/ai/roles/bogus', { mode: 'disabled' });
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  it('rejects inherit mode on the primary role and accepts it on task roles', async () => {
    const rejected = await put('/ai/roles/primary', { mode: 'inherit' });
    expect(rejected.status).toBe(400);
    const accepted = await put('/ai/roles/comment', { mode: 'inherit' });
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).data).toMatchObject({ role: 'comment', mode: 'inherit' });
  });

  it('persists the dedicated memory role', async () => {
    const res = await put('/ai/roles/memory', { mode: 'inherit' });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ role: 'memory', mode: 'inherit' });
    expect(ctx.settingsStore.getRole('memory')).toMatchObject({ mode: 'inherit' });
  });

  it('rejects an unknown provider', async () => {
    const res = await put('/ai/roles/analyst', {
      mode: 'custom',
      provider: 'not-a-provider',
      modelId: 'x',
      thinkingLevel: 'off',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a model not in the catalog', async () => {
    const res = await put('/ai/roles/analyst', {
      mode: 'custom',
      provider: ANALYST_PROVIDER,
      modelId: 'no-such-model',
      thinkingLevel: 'off',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a thinkingLevel the model does not support', async () => {
    const res = await put('/ai/roles/analyst', {
      mode: 'custom',
      provider: ANALYST_PROVIDER,
      modelId: ANALYST_MODEL_ID,
      thinkingLevel: 'not-a-level',
    });
    expect(res.status).toBe(400);
  });

  it('persists a valid custom setting and returns it', async () => {
    const res = await put('/ai/roles/analyst', {
      mode: 'custom',
      provider: ANALYST_PROVIDER,
      modelId: ANALYST_MODEL_ID,
      thinkingLevel: analystThinkingLevel,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({
      role: 'analyst',
      mode: 'custom',
      provider: ANALYST_PROVIDER,
      modelId: ANALYST_MODEL_ID,
      thinkingLevel: analystThinkingLevel,
    });
    expect(ctx.settingsStore.getRole('analyst')).toMatchObject({
      mode: 'custom',
      provider: ANALYST_PROVIDER,
      modelId: ANALYST_MODEL_ID,
    });
  });

  it('DELETE sets the role to disabled', async () => {
    ctx.settingsStore.setRole('analyst', {
      mode: 'custom',
      provider: ANALYST_PROVIDER,
      modelId: ANALYST_MODEL_ID,
      thinkingLevel: analystThinkingLevel,
    });
    const res = await del('/ai/roles/analyst');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { role: 'analyst', mode: 'disabled' } });
    expect(ctx.settingsStore.getRole('analyst')).toMatchObject({
      mode: 'disabled',
      provider: null,
    });
  });
});

describe('PUT/DELETE /ai/credentials/:provider', () => {
  it('rejects setting an api key for openai-codex', async () => {
    const res = await put('/ai/credentials/openai-codex', { key: 'x' });
    expect(res.status).toBe(400);
    expect((await res.json()).hint).toMatch(/codex/i);
  });

  it('rejects an empty key', async () => {
    const res = await put('/ai/credentials/deepseek', { key: '' });
    expect(res.status).toBe(400);
  });

  it('sets an api key, encrypts it in the DB, and returns a masked tail', async () => {
    const res = await put('/ai/credentials/deepseek', { key: 'sk-real-secret-9876' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.provider).toBe('deepseek');
    expect(body.data.masked.endsWith('9876')).toBe(true);

    const row = ctx.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.provider, 'deepseek'))
      .get();
    expect(row?.secret.startsWith('v1:')).toBe(true);
  });

  it('DELETE removes a credential', async () => {
    ctx.credentials.setApiKey('deepseek', 'sk-real-secret-9876');
    const res = await del('/ai/credentials/deepseek');
    expect(res.status).toBe(200);
    await expect(ctx.credentials.read('deepseek')).resolves.toBeUndefined();
  });

  it('DELETE openai-codex is rejected', async () => {
    const res = await del('/ai/credentials/openai-codex');
    expect(res.status).toBe(400);
  });
});

describe('GET /ai/catalog', () => {
  it('only lists the allowlisted providers plus OAuth providers', async () => {
    const res = await get('/ai/catalog');
    expect(res.status).toBe(200);
    const ids = (await res.json()).data.providers.map((p: { id: string }) => p.id).sort();
    const expected = [...SINGLE_KEY_PROVIDERS, 'openai-codex', 'lobehub'].sort();
    expect(ids).toEqual(expected);
  });

  it('shows configured for a provider with a stored key, missing for codex with no auth file', async () => {
    ctx.credentials.setApiKey(ANALYST_PROVIDER, 'sk-real-secret-9876');
    const res = await get('/ai/catalog');
    const providers = (await res.json()).data.providers as {
      id: string;
      auth: { kind: string; status: string };
    }[];
    const anthropic = providers.find((p) => p.id === ANALYST_PROVIDER);
    expect(anthropic?.auth).toEqual({ kind: 'api_key', status: 'configured' });
    const codex = providers.find((p) => p.id === 'openai-codex');
    expect(codex?.auth).toEqual({ kind: 'oauth', status: 'missing' });
  });

  it('carries a non-empty thinkingLevels array for each catalog model', async () => {
    const res = await get('/ai/catalog');
    const providers = (await res.json()).data.providers as {
      id: string;
      models: { thinkingLevels: string[] }[];
    }[];
    const anthropic = providers.find((p) => p.id === ANALYST_PROVIDER);
    expect(anthropic?.models.length).toBeGreaterThan(0);
    for (const model of anthropic?.models ?? []) {
      expect(model.thinkingLevels.length).toBeGreaterThan(0);
    }
  });
});

describe('POST /ai/test', () => {
  it('returns a latencyMs on success', async () => {
    const models = stubModels(async () => ({ role: 'assistant' }) as never, ctx.credentials);
    applyCtx(ctx, { models });
    const res = await post('/ai/test', {
      provider: ANALYST_PROVIDER,
      modelId: ANALYST_MODEL_ID,
      thinkingLevel: analystThinkingLevel,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.data.latencyMs).toBe('number');
    expect(body.data.ok).toBe(true);
  });

  it('redacts a plaintext key that leaks into the upstream error message', async () => {
    ctx.credentials.setApiKey(ANALYST_PROVIDER, 'sk-real-secret-9876');
    const models = stubModels(async () => {
      throw new Error('upstream rejected key sk-real-secret-9876');
    }, ctx.credentials);
    applyCtx(ctx, { models });
    const res = await post('/ai/test', {
      provider: ANALYST_PROVIDER,
      modelId: ANALYST_MODEL_ID,
      thinkingLevel: analystThinkingLevel,
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.hint).toContain('[redacted]');
    expect(body.hint).not.toContain('sk-real-secret-9876');
  });

  it('times out with a 504 and a stable timeout category', async () => {
    const models = stubModels(() => new Promise(() => {}), ctx.credentials);
    applyCtx(ctx, { models, testTimeoutMs: 50 });
    const res = await post('/ai/test', {
      provider: ANALYST_PROVIDER,
      modelId: ANALYST_MODEL_ID,
      thinkingLevel: analystThinkingLevel,
    });
    expect(res.status).toBe(504);
    expect((await res.json()).error).toBe('timeout');
  });
});

describe('POST /ai/reset-credentials', () => {
  it('wipes all credentials and rotates the master key', async () => {
    ctx.credentials.setApiKey('deepseek', 'sk-one-secret-1111');
    ctx.credentials.setApiKey('openai', 'sk-two-secret-2222');
    const oldRow = ctx.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.provider, 'deepseek'))
      .get();
    if (!oldRow) throw new Error('unreachable');

    const res = await post('/ai/reset-credentials');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { reset: true } });

    expect(ctx.credentials.listEntries()).toEqual([]);
    expect(() => ctx.secretBox.decrypt('deepseek', oldRow.secret)).toThrow();
  });
});

describe('no-plaintext sweep', () => {
  it('never echoes a stored plaintext key across GET /ai, GET /ai/catalog, or a failed /ai/test', async () => {
    const canary = 'sk-plaintext-canary-1234';
    ctx.credentials.setApiKey(ANALYST_PROVIDER, canary);

    const models = stubModels(async () => {
      throw new Error(`upstream said: ${canary}`);
    }, ctx.credentials);
    applyCtx(ctx, { models });

    const getAi = await get('/ai');
    const getCatalog = await get('/ai/catalog');
    const testRes = await post('/ai/test', {
      provider: ANALYST_PROVIDER,
      modelId: ANALYST_MODEL_ID,
      thinkingLevel: analystThinkingLevel,
    });

    for (const res of [getAi, getCatalog, testRes]) {
      expect(JSON.stringify(await res.json())).not.toContain(canary);
    }
  });
});

describe('GET/PUT /watched-markets', () => {
  it('GET returns the default watched markets, wrapped in {ok, data}', async () => {
    const res = await get('/watched-markets');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ markets: ['US'] });
  });

  it('PUT persists the new set and returns it', async () => {
    const res = await put('/watched-markets', { markets: ['US', 'HK'] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ markets: ['US', 'HK'] });
    expect(ctx.watchedMarketsStore.get()).toEqual(['US', 'HK']);

    const getRes = await get('/watched-markets');
    expect((await getRes.json()).data).toEqual({ markets: ['US', 'HK'] });
  });

  it('PUT rejects an empty array', async () => {
    const res = await put('/watched-markets', { markets: [] });
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
    expect(ctx.watchedMarketsStore.get()).toEqual(['US']);
  });
});

describe('GET /ai/usage-today', () => {
  function insertUsage(
    layer: string,
    origin: string | null,
    calls: number,
    cost: number,
    date: string,
  ) {
    ctx.db
      .insert(aiUsage)
      .values({
        id: `${layer}-${origin ?? 'none'}-${date}-${Math.abs(cost * 1000) | 0}-${calls}`,
        ts: new Date().toISOString(),
        easternDate: date,
        layer,
        symbol: 'TEST',
        model: 'anthropic/claude-sonnet-4-5',
        origin,
        calls,
        totalTokens: 100,
        input: 50,
        output: 50,
        cacheRead: 0,
        cacheWrite: 0,
        costTotal: cost,
      })
      .run();
  }

  it("groups today's usage by role, folds event-filter into comment, splits deep-dive from analyst", async () => {
    const today = easternDate(new Date());
    insertUsage('commentator', null, 3, 0.03, today);
    insertUsage('event-filter', null, 2, 0.01, today);
    insertUsage('analyst', 'escalation', 1, 0.2, today);
    insertUsage('analyst', 'deep-dive', 1, 0.5, today);
    insertUsage('chat', null, 4, 0.04, today);
    insertUsage('memory', 'idle-maintenance', 2, 0.02, today);
    insertUsage('mystery-layer', null, 1, 1, today);
    insertUsage('chat', null, 9, 9, '2000-01-01');

    const res = await get('/ai/usage-today');
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.roles.comment).toEqual({ calls: 5, cost: 0.04 });
    expect(data.roles.analyst).toEqual({ calls: 1, cost: 0.2 });
    expect(data.roles.deepDive).toEqual({ calls: 1, cost: 0.5 });
    expect(data.roles.chat).toEqual({ calls: 4, cost: 0.04 });
    expect(data.roles.memory).toEqual({ calls: 2, cost: 0.02 });
    expect(data.total.calls).toBe(14);
    expect(data.total.cost).toBeCloseTo(1.8, 10);
  });

  it('returns zeros with no usage rows', async () => {
    const res = await get('/ai/usage-today');
    const { data } = await res.json();
    expect(data.roles.comment).toEqual({ calls: 0, cost: 0 });
    expect(data.roles.memory).toEqual({ calls: 0, cost: 0 });
    expect(data.total).toEqual({ calls: 0, cost: 0 });
  });
});
