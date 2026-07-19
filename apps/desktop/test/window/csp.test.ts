import { describe, expect, it, vi } from 'vitest';
import {
  applyContentSecurityPolicy,
  buildContentSecurityPolicy,
  CSP_HEADER_NAME,
} from '@desktop/window/csp.js';

describe('buildContentSecurityPolicy', () => {
  it('allows self, pro-asset:, and blob: in script-src, no unsafe-inline/wildcards', () => {
    const csp = buildContentSecurityPolicy();
    const scriptSrc = csp.split('; ').find((d) => d.startsWith('script-src'));

    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain('pro-asset:');
    expect(scriptSrc).toContain('blob:');
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain('*');
  });

  it('extends script-src with explicit extra origins only when given', () => {
    const csp = buildContentSecurityPolicy({ extraScriptSrcOrigins: ['https://vibeloft.ai'] });
    const scriptSrc = csp.split('; ').find((d) => d.startsWith('script-src'));

    expect(scriptSrc).toContain('https://vibeloft.ai');
  });

  it('adds the nonce source only when scriptNonce is given, and omits it otherwise', () => {
    const withoutNonce = buildContentSecurityPolicy();
    const scriptSrcWithout = withoutNonce.split('; ').find((d) => d.startsWith('script-src'));
    expect(scriptSrcWithout).not.toMatch(/'nonce-/);

    const withNonce = buildContentSecurityPolicy({ scriptNonce: 'deadbeef' });
    const scriptSrcWith = withNonce.split('; ').find((d) => d.startsWith('script-src'));
    expect(scriptSrcWith).toContain("'nonce-deadbeef'");
  });
});

describe('applyContentSecurityPolicy', () => {
  it('registers an onHeadersReceived listener that injects the CSP header', () => {
    let registered: ((details: unknown, callback: (r: unknown) => void) => void) | undefined;
    const fakeSession = {
      webRequest: {
        onHeadersReceived: vi.fn((handler) => {
          registered = handler;
        }),
      },
    };

    applyContentSecurityPolicy(fakeSession as never);

    expect(fakeSession.webRequest.onHeadersReceived).toHaveBeenCalledTimes(1);
    expect(registered).toBeDefined();

    let result: { responseHeaders?: Record<string, string[]> } | undefined;
    registered!({ responseHeaders: { 'X-Existing': ['keep-me'] } }, (r) => {
      result = r as typeof result;
    });

    expect(result?.responseHeaders?.['X-Existing']).toEqual(['keep-me']);
    const cspValues = result?.responseHeaders?.[CSP_HEADER_NAME];
    expect(cspValues).toBeDefined();
    expect(cspValues?.[0]).toContain('pro-asset:');
    expect(cspValues?.[0]).toMatch(/script-src[^;]*'self'/);
  });
});
