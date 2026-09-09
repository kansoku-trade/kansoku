import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getSupportedThinkingLevels } from '@earendil-works/pi-ai';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCodexModelCatalog } from '../src/ai/settings/codexModelCatalog.js';

const builtin = builtinModels().getModels('openai-codex');

function entry(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    slug,
    display_name: slug.toUpperCase(),
    visibility: 'list',
    context_window: 272000,
    input_modalities: ['text', 'image'],
    supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'high' }],
    ...overrides,
  };
}

describe('createCodexModelCatalog', () => {
  let dir: string;
  let cachePath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'codex-catalog-'));
    cachePath = path.join(dir, 'models_cache.json');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('falls back to the builtin list when the cache is missing or unusable', () => {
    expect(createCodexModelCatalog(builtin, cachePath)()).toEqual(builtin);
    writeFileSync(cachePath, 'not json');
    expect(createCodexModelCatalog(builtin, cachePath)()).toEqual(builtin);
    writeFileSync(cachePath, JSON.stringify({ models: [entry('hidden', { visibility: 'hide' })] }));
    expect(createCodexModelCatalog(builtin, cachePath)()).toEqual(builtin);
  });

  it('exposes cached models the builtin list does not know', () => {
    writeFileSync(cachePath, JSON.stringify({ models: [entry('gpt-9-new')] }));
    const models = createCodexModelCatalog(builtin, cachePath)();
    expect(models.map((m) => m.id)).toEqual(['gpt-9-new']);
    expect(models[0]).toMatchObject({
      provider: 'openai-codex',
      api: builtin[0]?.api,
      name: 'GPT-9-NEW',
      contextWindow: 272000,
      cost: { input: 0, output: 0 },
    });
    expect(getSupportedThinkingLevels(models[0]!)).toEqual(['off', 'minimal', 'low', 'medium', 'high']);
  });

  it('keeps builtin pricing and maps the extra thinking levels', () => {
    const known = builtin.find((m) => m.id === 'gpt-5.6-luna');
    writeFileSync(
      cachePath,
      JSON.stringify({
        models: [
          entry('gpt-5.6-luna', {
            supported_reasoning_levels: [
              { effort: 'low' },
              { effort: 'medium' },
              { effort: 'high' },
              { effort: 'xhigh' },
              { effort: 'max' },
            ],
          }),
        ],
      }),
    );
    const model = createCodexModelCatalog(builtin, cachePath)()[0]!;
    expect(model.cost).toEqual(known?.cost);
    expect(getSupportedThinkingLevels(model)).toEqual([
      'off',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]);
  });

  it('re-reads the cache after the file changes', () => {
    writeFileSync(cachePath, JSON.stringify({ models: [entry('a')] }));
    const catalog = createCodexModelCatalog(builtin, cachePath);
    expect(catalog().map((m) => m.id)).toEqual(['a']);
    writeFileSync(cachePath, JSON.stringify({ models: [entry('a'), entry('b')] }));
    expect(catalog().map((m) => m.id)).toEqual(['a', 'b']);
  });
});
