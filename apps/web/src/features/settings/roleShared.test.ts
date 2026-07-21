import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CODEX_MODEL_ID,
  defaultCustom,
  defaultThinkingLevel,
  firstModelId,
} from './roleShared';
import type { Catalog } from './types';

const catalog: Catalog = {
  providers: [
    {
      id: 'lobehub',
      name: 'LobeHub Cloud',
      auth: { kind: 'oauth', status: 'configured' },
      models: [
        {
          id: 'reasoning-only',
          name: 'Reasoning Only',
          thinkingLevels: ['minimal', 'low', 'high'],
        },
        { id: 'regular', name: 'Regular', thinkingLevels: ['off'] },
      ],
    },
  ],
};

describe('roleShared model defaults', () => {
  it('prefers GPT-5.6 Luna for Codex even when an older model is listed first', () => {
    const codexCatalog: Catalog = {
      providers: [
        {
          id: 'openai-codex',
          name: 'OpenAI Codex',
          auth: { kind: 'oauth', status: 'configured' },
          models: [
            { id: 'gpt-5.3-codex-spark', name: 'GPT-5.3 Codex Spark', thinkingLevels: ['off'] },
            {
              id: DEFAULT_CODEX_MODEL_ID,
              name: 'GPT-5.6 Luna',
              thinkingLevels: ['minimal', 'xhigh'],
            },
          ],
        },
      ],
    };

    expect(firstModelId(codexCatalog, 'openai-codex')).toBe(DEFAULT_CODEX_MODEL_ID);
  });

  it("uses the selected model's first supported thinking level instead of assuming off", () => {
    expect(defaultThinkingLevel(catalog, 'lobehub', 'reasoning-only')).toBe('minimal');
    expect(defaultThinkingLevel(catalog, 'lobehub', 'regular')).toBe('off');
    expect(defaultCustom(catalog)).toMatchObject({
      provider: 'lobehub',
      modelId: 'reasoning-only',
      thinkingLevel: 'minimal',
    });
  });
});
