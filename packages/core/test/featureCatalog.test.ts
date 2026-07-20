import { describe, expect, it } from 'vitest';
import { FEATURES } from '@kansoku/pro-api/features';

describe('FEATURES catalog', () => {
  it('matches snapshot', () => {
    expect(FEATURES).toMatchInlineSnapshot(`
      {
        "auto-patterns": {
          "tier": "pro",
        },
        "deep-dive": {
          "tier": "pro",
        },
        "memory": {
          "tier": "pro",
        },
        "options-walls": {
          "tier": "pro",
        },
        "research-ai": {
          "tier": "pro",
        },
        "symbol-follow": {
          "tier": "pro",
        },
      }
    `);
  });
});
