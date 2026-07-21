import { describe, expect, it } from 'vitest';
import { normalizeAiRoles, ROLES, type AiRoles, type RoleSetting } from './types';

const configured: RoleSetting = {
  mode: 'custom',
  provider: 'anthropic',
  modelId: 'claude-opus',
  thinkingLevel: 'off',
  stale: false,
};

describe('normalizeAiRoles', () => {
  it('passes a complete AiRoles object through unchanged', () => {
    const roles: AiRoles = {
      primary: configured,
      comment: configured,
      analyst: configured,
      deepDive: configured,
      chat: configured,
      memory: configured,
    };

    expect(normalizeAiRoles(roles)).toEqual(roles);
  });

  it('fills in a role missing from a stale persisted-cache snapshot with its default setting', () => {
    const staleRoles = {
      primary: configured,
      comment: configured,
      analyst: configured,
      deepDive: configured,
      chat: configured,
      // 'memory' absent, as in a react-query localStorage cache persisted
      // before the 2026-07-20 role addition (aa9bb43).
    } as Partial<AiRoles>;

    const normalized = normalizeAiRoles(staleRoles);

    expect(normalized.memory).toEqual({
      mode: 'inherit',
      provider: null,
      modelId: null,
      thinkingLevel: null,
      stale: false,
    });
    for (const role of ROLES) {
      expect(normalized[role]).toBeDefined();
    }
  });

  it('falls back to a fully-default AiRoles object when given null or undefined', () => {
    for (const input of [null, undefined] as const) {
      const normalized = normalizeAiRoles(input);
      expect(normalized.primary).toEqual({
        mode: 'disabled',
        provider: null,
        modelId: null,
        thinkingLevel: null,
        stale: false,
      });
      for (const role of ROLES) {
        expect(normalized[role]).toEqual({
          mode: 'inherit',
          provider: null,
          modelId: null,
          thinkingLevel: null,
          stale: false,
        });
      }
    }
  });
});
