import { describe, expect, it } from 'vitest';
import type { AiModel } from '../src/ai/runtime/models.js';
import { buildProvenance, promptVersionOf } from '../src/ai/runtime/provenance.js';

const model = { provider: 'anthropic', id: 'claude-haiku-4-5' } as unknown as AiModel;

describe('promptVersionOf', () => {
  it('is stable for identical prompt parts', () => {
    expect(promptVersionOf('system', 'skill')).toBe(promptVersionOf('system', 'skill'));
  });

  it('changes when any part changes', () => {
    expect(promptVersionOf('system', 'skill')).not.toBe(promptVersionOf('system', 'skill v2'));
  });

  it('distinguishes part boundaries from concatenation', () => {
    expect(promptVersionOf('ab', 'c')).not.toBe(promptVersionOf('a', 'bc'));
  });
});

describe('buildProvenance', () => {
  it('captures provider, model id and prompt version', () => {
    expect(buildProvenance(model, 'system', 'skill')).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      promptVersion: promptVersionOf('system', 'skill'),
    });
  });
});
