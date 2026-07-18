export function symbolWithoutMarket(symbol: string): string {
  const idx = symbol.lastIndexOf(".");
  return idx === -1 ? symbol : symbol.slice(0, idx);
}

export function buildQuestionId(symbol: string, cutoffDate: string, seq: number): string {
  const seqStr = String(seq).padStart(2, "0");
  return `swing-${symbolWithoutMarket(symbol)}-${cutoffDate}-${seqStr}`;
}
