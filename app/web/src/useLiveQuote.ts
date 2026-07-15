import { useEffect, useState } from "react";
import type { QuoteCell, QuoteSnapshot } from "../../shared/types";
import { normalizeSymbol } from "./lib/symbol";
import { useWsChannel } from "./useWsChannel";

function quoteChanged(previous: QuoteCell | null, next: QuoteCell | null): boolean {
  if (previous === next) return false;
  if (!previous || !next) return true;
  return (
    previous.symbol !== next.symbol ||
    previous.session !== next.session ||
    previous.last !== next.last ||
    previous.pct !== next.pct ||
    previous.regularLast !== next.regularLast ||
    previous.regularPct !== next.regularPct ||
    previous.asOf !== next.asOf
  );
}

export function useLiveQuote(symbol: string | null): QuoteCell | null {
  const normalized = symbol ? normalizeSymbol(symbol) : null;
  const [quote, setQuote] = useState<QuoteCell | null>(null);

  useEffect(() => setQuote(null), [normalized]);

  useWsChannel<QuoteSnapshot>(normalized ? { kind: "quotes", extra: [normalized] } : null, (snapshot) => {
    const next = snapshot.quotes.find((item) => item.symbol === normalized) ?? null;
    setQuote((previous) => (quoteChanged(previous, next) ? next : previous));
  });

  return quote;
}
