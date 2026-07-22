const TOKEN_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g,
];

const LABELED_SECRET =
  /((?:api[_-]?key|apikey|app[_-]?key|access[_-]?key|access[_-]?token|secret|token|password|passwd)\s*[=:：]\s*)(["']?)[A-Za-z0-9._~+/=-]{8,}\2/gi;

const ACCOUNT_NUMBER = /((?:账户|账号|account(?:\s*(?:no\.?|number|id))?)\s*[:：#]?\s*)\d{6,}/gi;

export function redact(text: string): string {
  let out = text;
  for (const pattern of TOKEN_PATTERNS) out = out.replace(pattern, '[REDACTED]');
  out = out.replace(LABELED_SECRET, '$1[REDACTED]');
  out = out.replace(ACCOUNT_NUMBER, '$1[REDACTED]');
  return out;
}
