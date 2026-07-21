export const TARGET_LAG_MS = 400;
export const MIN_RATE_CPS = 30;
export const MAX_RATE_CPS = 1200;

export function drainBudget(backlog: number, elapsedMs: number): number {
  if (backlog <= 0 || elapsedMs <= 0) return 0;
  const rate = Math.min(Math.max(backlog / (TARGET_LAG_MS / 1000), MIN_RATE_CPS), MAX_RATE_CPS);
  return Math.min(Math.ceil((rate * elapsedMs) / 1000), backlog);
}

// A cut that lands between a surrogate pair would render a broken glyph mid-stream.
export function safeCut(text: string, count: number): number {
  if (count >= text.length) return text.length;
  let cut = count;
  const code = text.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut += 1;
  return cut;
}
