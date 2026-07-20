import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiConfig, type AiModel, parseModelRef, resolveModel } from '../src/ai/runtime/models.js';
import { createSettingsStore, setActiveSettingsStore } from '../src/ai/settings/settingsStore.js';
import { createDb } from '../src/db/index.js';

const fakeModel = { provider: 'anthropic', id: 'claude-haiku-4-5' } as unknown as AiModel;
const realModel = builtinModels().getModels('anthropic')[0];

describe('parseModelRef', () => {
  it('splits on the first slash', () => {
    expect(parseModelRef('anthropic/claude-haiku-4-5')).toEqual({
      provider: 'anthropic',
      id: 'claude-haiku-4-5',
    });
  });

  it('keeps later slashes inside the id', () => {
    expect(parseModelRef('openrouter/google/gemini-2.5-flash')).toEqual({
      provider: 'openrouter',
      id: 'google/gemini-2.5-flash',
    });
  });

  it('parses a thinking-level suffix', () => {
    expect(parseModelRef('openai-codex/gpt-5.5:high')).toEqual({
      provider: 'openai-codex',
      id: 'gpt-5.5',
      thinkingLevel: 'high',
    });
  });

  it('keeps an unknown colon suffix inside the id', () => {
    expect(parseModelRef('openai-codex/gpt-5.5:turbo')).toEqual({
      provider: 'openai-codex',
      id: 'gpt-5.5:turbo',
    });
  });

  it('rejects missing provider or id', () => {
    expect(parseModelRef('')).toBeNull();
    expect(parseModelRef('noslash')).toBeNull();
    expect(parseModelRef('/onlyid')).toBeNull();
    expect(parseModelRef('onlyprovider/')).toBeNull();
  });
});

describe('resolveModel', () => {
  it('returns null when the env value is missing', () => {
    expect(resolveModel(undefined)).toBeNull();
    expect(resolveModel('')).toBeNull();
  });

  it('returns null for an unparseable ref without calling lookup', () => {
    let called = false;
    const lookup = () => {
      called = true;
      return fakeModel;
    };
    expect(resolveModel('garbage', lookup)).toBeNull();
    expect(called).toBe(false);
  });

  it('returns the resolved model', () => {
    const lookup = (provider: string, id: string) => {
      expect(provider).toBe('anthropic');
      expect(id).toBe('claude-haiku-4-5');
      return fakeModel;
    };
    expect(resolveModel('anthropic/claude-haiku-4-5', lookup)).toBe(fakeModel);
  });

  it('attaches the thinking level to the resolved model', () => {
    const model = resolveModel('anthropic/claude-haiku-4-5:high', () => fakeModel);
    expect(model).not.toBe(fakeModel);
    expect(model?.id).toBe('claude-haiku-4-5');
    expect(model?.thinkingLevel).toBe('high');
  });

  it('returns null when the model is unknown', () => {
    expect(resolveModel('anthropic/does-not-exist', () => undefined)).toBeNull();
  });

  it('returns null and does not throw when lookup throws', () => {
    const lookup = () => {
      throw new Error('unknown provider');
    };
    expect(() => resolveModel('bogus/model', lookup)).not.toThrow();
    expect(resolveModel('bogus/model', lookup)).toBeNull();
  });

  it('resolves a real built-in model through the default lookup', () => {
    const model = resolveModel('anthropic/claude-haiku-4-5');
    expect(model).not.toBeNull();
    expect(model?.id).toBe('claude-haiku-4-5');
  });
});

describe('aiConfig', () => {
  let dir: string;

  function storeOverDb(): ReturnType<typeof createSettingsStore> {
    dir = mkdtempSync(join(tmpdir(), 'models-test-'));
    const db = createDb(join(dir, 'app.db'));
    return createSettingsStore(db);
  }

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    setActiveSettingsStore(null);
    vi.restoreAllMocks();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for every layer when all roles are disabled', () => {
    const store = storeOverDb();
    setActiveSettingsStore(store);
    expect(aiConfig()).toEqual({
      commentModel: null,
      analystModel: null,
      deepDiveModel: null,
      chatModel: null,
      memoryModel: null,
    });
  });

  it('resolves each layer from its role setting', () => {
    const store = storeOverDb();
    store.setRole('comment', {
      mode: 'custom',
      provider: realModel.provider,
      modelId: realModel.id,
      thinkingLevel: 'medium',
    });
    setActiveSettingsStore(store);
    const config = aiConfig();
    expect(config.commentModel?.id).toBe(realModel.id);
    expect(config.analystModel).toBeNull();
  });

  it('resolves deepDiveModel from a custom deepDive role', () => {
    const store = storeOverDb();
    store.setRole('deepDive', {
      mode: 'custom',
      provider: realModel.provider,
      modelId: realModel.id,
      thinkingLevel: 'medium',
    });
    setActiveSettingsStore(store);
    expect(aiConfig().deepDiveModel?.id).toBe(realModel.id);
  });

  it('returns null deepDiveModel when disabled', () => {
    const store = storeOverDb();
    setActiveSettingsStore(store);
    expect(aiConfig().deepDiveModel).toBeNull();
  });

  it("uses the chat role's own custom setting when set", () => {
    const store = storeOverDb();
    store.setRole('chat', {
      mode: 'custom',
      provider: realModel.provider,
      modelId: realModel.id,
      thinkingLevel: 'medium',
    });
    setActiveSettingsStore(store);
    expect(aiConfig().chatModel?.id).toBe(realModel.id);
  });

  it('resolves every inherit role from the primary model', () => {
    const store = storeOverDb();
    store.setRole('primary', {
      mode: 'custom',
      provider: realModel.provider,
      modelId: realModel.id,
      thinkingLevel: 'medium',
    });
    setActiveSettingsStore(store);
    const config = aiConfig();
    expect(config.chatModel?.id).toBe(realModel.id);
    expect(config.chatModel).toBe(config.analystModel);
    expect(config.commentModel).toBe(config.analystModel);
    expect(config.deepDiveModel).toBe(config.analystModel);
    expect(config.memoryModel).toBe(config.analystModel);
  });

  it('returns null for inherit roles when primary is unset; a custom analyst does not leak into chat', () => {
    const store = storeOverDb();
    store.setRole('analyst', {
      mode: 'custom',
      provider: realModel.provider,
      modelId: realModel.id,
      thinkingLevel: 'medium',
    });
    setActiveSettingsStore(store);
    const config = aiConfig();
    expect(config.analystModel?.id).toBe(realModel.id);
    expect(config.chatModel).toBeNull();
  });

  it('returns null chatModel when chat is disabled, even if analyst is set', () => {
    const store = storeOverDb();
    store.setRole('analyst', {
      mode: 'custom',
      provider: realModel.provider,
      modelId: realModel.id,
      thinkingLevel: 'medium',
    });
    store.setRole('chat', { mode: 'disabled', provider: null, modelId: null, thinkingLevel: null });
    setActiveSettingsStore(store);
    const config = aiConfig();
    expect(config.analystModel).not.toBeNull();
    expect(config.chatModel).toBeNull();
  });

  it('throws a clear error when no active settings store is set', () => {
    setActiveSettingsStore(null);
    expect(() => aiConfig()).toThrow(/settings store/i);
  });
});
