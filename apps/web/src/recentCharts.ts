const KEY = "trade.recent-symbols";
const LEGACY_KEY = "trade.recent-charts";
const MAX = 5;

export interface RecentSymbol {
  symbol: string;
}

try {
  localStorage.removeItem(LEGACY_KEY);
} catch {
  // ignore: localStorage may be unavailable (SSR/tests)
}

export function listRecentSymbols(): RecentSymbol[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => s && typeof s.symbol === "string") : [];
  } catch {
    return [];
  }
}

export function recordRecentSymbol(symbol: string): void {
  try {
    const list = [{ symbol }, ...listRecentSymbols().filter((s) => s.symbol !== symbol)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    return;
  }
}
