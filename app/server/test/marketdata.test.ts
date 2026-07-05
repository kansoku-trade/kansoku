import { afterEach, describe, expect, it, vi } from "vitest";
import { getProvider, listProviders } from "../src/services/marketdata/registry.js";
import type { Capability, MarketDataProvider } from "../src/services/marketdata/types.js";

const OPTIONAL_METHODS: Record<Capability, keyof MarketDataProvider> = {
  flow: "getFlow",
  "capital-distribution": "getCapitalDistribution",
  positions: "getPositions",
  watchlist: "getWatchlistSymbols",
};

describe("marketdata registry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to the longbridge provider", () => {
    vi.stubEnv("MARKET_PROVIDER", "");
    expect(getProvider().name).toBe("longbridge");
  });

  it("selects the provider named by MARKET_PROVIDER", () => {
    vi.stubEnv("MARKET_PROVIDER", "longbridge");
    expect(getProvider().name).toBe("longbridge");
  });

  it("rejects an unknown MARKET_PROVIDER with a hint listing the options", () => {
    vi.stubEnv("MARKET_PROVIDER", "yahoo");
    expect(() => getProvider()).toThrow("unknown MARKET_PROVIDER: yahoo");
  });
});

describe("provider contract", () => {
  for (const name of listProviders()) {
    it(`${name}: declared capabilities match implemented optional methods`, () => {
      vi.stubEnv("MARKET_PROVIDER", name);
      const provider = getProvider();
      for (const [capability, method] of Object.entries(OPTIONAL_METHODS)) {
        const declared = provider.capabilities.has(capability as Capability);
        const implemented = typeof provider[method as keyof MarketDataProvider] === "function";
        expect(declared, `${name}.${method} vs capability "${capability}"`).toBe(implemented);
      }
      vi.unstubAllEnvs();
    });

    it(`${name}: implements every core method`, () => {
      vi.stubEnv("MARKET_PROVIDER", name);
      const provider = getProvider();
      expect(typeof provider.getKline).toBe("function");
      expect(typeof provider.getQuotes).toBe("function");
      expect(typeof provider.getNews).toBe("function");
      vi.unstubAllEnvs();
    });
  }
});
