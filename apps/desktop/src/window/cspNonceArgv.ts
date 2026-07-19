// Split out from cspNonce.ts (which imports node:crypto) so preload.ts —
// running under Electron's sandboxed preload context, which does not expose
// every Node built-in — can read this prefix constant without pulling a
// node:crypto import into its bundle.
export const CSP_NONCE_ARGV_PREFIX = '--kansoku-csp-nonce=';
