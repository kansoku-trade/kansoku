import type { ChartDoc } from "../../../../shared/types.js";
import { getProvider } from "./marketdata/registry.js";
import type { MarketDataProvider } from "./marketdata/types.js";

const HAN_RE = /\p{Script=Han}/u;

function nonEmptyName(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function resolveSecurityName(
  symbol: string,
  fallback: unknown,
  provider: MarketDataProvider = getProvider(),
): Promise<string> {
  const fallbackName = nonEmptyName(fallback) ?? symbol;
  if (HAN_RE.test(fallbackName) || !provider.getSecurityName) return fallbackName;

  try {
    return nonEmptyName(await provider.getSecurityName(symbol)) ?? fallbackName;
  } catch {
    return fallbackName;
  }
}

export async function localizeChartDocName(
  doc: ChartDoc,
  provider: MarketDataProvider = getProvider(),
): Promise<ChartDoc> {
  if (doc.built.kind !== "intraday" && doc.built.kind !== "sepa") return doc;
  if (!("sidebar" in doc.built) || !doc.built.sidebar) return doc;

  const symbol = doc.symbol ?? doc.built.sidebar.symbol;
  if (!symbol) return doc;
  const fallback = nonEmptyName(doc.input.name) ?? doc.built.sidebar.name;
  const name = await resolveSecurityName(symbol, fallback, provider);
  if (name === doc.built.sidebar.name && name === doc.input.name) return doc;

  if (doc.built.kind === "intraday") {
    return {
      ...doc,
      input: { ...doc.input, name },
      built: { ...doc.built, sidebar: { ...doc.built.sidebar, name } },
    };
  }

  return {
    ...doc,
    input: { ...doc.input, name },
    built: { ...doc.built, sidebar: { ...doc.built.sidebar, name } },
  };
}
