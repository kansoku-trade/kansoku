import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initAiSettings, setAiRuntimeForTests } from '@kansoku/core/ai/settings/initAiSettings';
import { setModelsRuntimeForTests } from '@kansoku/core/ai/runtime/modelsRuntime';
import { setActiveSettingsStore } from '@kansoku/core/ai/settings/settingsStore';
import {
  createWatchedMarketsStore,
  setActiveWatchedMarketsStore,
} from '@kansoku/core/marketdata/watchedMarketsStore';
import { createDb } from '@kansoku/core/db/index';
import { unregisterProModuleForTests } from '@kansoku/core/pro/registry';
import { tsukiRequest } from './helpers.js';

describe('free AI settings without pro', () => {
  let dir: string;

  beforeEach(() => {
    unregisterProModuleForTests();
    setActiveSettingsStore(null);
    setAiRuntimeForTests(null);
    setModelsRuntimeForTests(null);
    dir = mkdtempSync(join(tmpdir(), 'free-ai-no-pro-'));
    const db = createDb(join(dir, 'app.db'));
    setActiveWatchedMarketsStore(createWatchedMarketsStore(db));
    initAiSettings(db, {});
  });

  afterEach(() => {
    setActiveSettingsStore(null);
    setAiRuntimeForTests(null);
    setModelsRuntimeForTests(null);
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves GET /api/settings/ai with pro absent', async () => {
    const res = await tsukiRequest('/api/settings/ai');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.credentials).toEqual([]);
    expect(body.data.roles.primary).toMatchObject({ mode: 'disabled' });
  });
});
