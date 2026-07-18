import type { Market } from "@kansoku/shared/time";

const SUFFIX_MARKET: Record<string, Market> = {
  US: "US",
  HK: "HK",
  SH: "CN",
  SZ: "CN",
};

export function marketOfSymbol(symbol: string | null | undefined): Market {
  if (!symbol) return "US";
  const suffix = symbol.trim().toUpperCase().split(".").pop();
  return (suffix && SUFFIX_MARKET[suffix]) || "US";
}
