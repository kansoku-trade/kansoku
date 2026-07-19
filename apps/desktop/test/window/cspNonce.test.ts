import { describe, expect, it } from 'vitest';
import { cspNonceAdditionalArgument, getCspScriptNonce } from '@desktop/window/cspNonce.js';
import { CSP_NONCE_ARGV_PREFIX } from '@desktop/window/cspNonceArgv.js';

describe('getCspScriptNonce', () => {
  it('returns the same value on every call within a process (session-wide, not per-request)', () => {
    const first = getCspScriptNonce();
    const second = getCspScriptNonce();
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('cspNonceAdditionalArgument', () => {
  it('embeds the same nonce getCspScriptNonce returns, prefixed for webPreferences.additionalArguments', () => {
    const arg = cspNonceAdditionalArgument();
    expect(arg).toBe(`${CSP_NONCE_ARGV_PREFIX}${getCspScriptNonce()}`);
    expect(arg.startsWith(CSP_NONCE_ARGV_PREFIX)).toBe(true);
  });
});
