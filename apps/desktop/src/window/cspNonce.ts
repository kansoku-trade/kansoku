import { randomBytes } from 'node:crypto';
import { CSP_NONCE_ARGV_PREFIX } from './cspNonceArgv.js';

let cachedNonce: string | null = null;

// One nonce per process lifetime: applyContentSecurityPolicy sets it session-wide
// via a single onHeadersReceived listener (not per-request), so every window's
// preload must receive the exact same value to legitimately nonce inline
// scripts (the shared-React importmap in bootstrapWebEditionHost) against it.
export function getCspScriptNonce(): string {
  if (cachedNonce === null) cachedNonce = randomBytes(16).toString('hex');
  return cachedNonce;
}

export function cspNonceAdditionalArgument(): string {
  return `${CSP_NONCE_ARGV_PREFIX}${getCspScriptNonce()}`;
}
