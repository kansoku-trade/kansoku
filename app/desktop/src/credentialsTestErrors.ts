const AUTH_RE = /token.*(expired|invalid|revoked)|invalid.*(access.?token|token)|unauthori[sz]ed|401|403|invalid[_ ]?api[_ ]?key/i;
const TIMEOUT_RE = /timeout|timed out|deadline exceeded/i;
const NETWORK_RE = /network|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|\bdns\b|unreachable/i;

const SAFE_MESSAGES = {
  auth_rejected: "Longbridge rejected the credentials — check the app key, app secret, and access token.",
  network_error: "Could not reach Longbridge — check the network connection.",
  timeout: "Longbridge did not respond in time.",
  unknown: "Longbridge credential test failed.",
} as const;

// The SDK's error text is opaque and, in the worst case, could echo back
// fragments of what was submitted — classifyCredentialTestError only ever
// returns one of these fixed strings, never any text derived from the SDK
// error itself, so nothing SDK-controlled reaches the renderer via IPC.
export function classifyCredentialTestError(scrubbedMessage: string): string {
  if (AUTH_RE.test(scrubbedMessage)) return SAFE_MESSAGES.auth_rejected;
  if (TIMEOUT_RE.test(scrubbedMessage)) return SAFE_MESSAGES.timeout;
  if (NETWORK_RE.test(scrubbedMessage)) return SAFE_MESSAGES.network_error;
  return SAFE_MESSAGES.unknown;
}
