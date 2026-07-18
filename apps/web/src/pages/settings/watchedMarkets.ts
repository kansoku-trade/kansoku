import type { Market } from "./types";

export function toggleMarket(current: Market[], market: Market, next: boolean): Market[] | null {
  if (next) {
    if (current.includes(market)) return current;
    return [...current, market];
  }
  if (!current.includes(market)) return current;
  if (current.length <= 1) return null;
  return current.filter((m) => m !== market);
}
