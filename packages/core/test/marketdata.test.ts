import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProvider, listProviders } from '../src/marketdata/registry.js';
import type { Capability, MarketDataProvider } from '../src/marketdata/types.js';

const OPTIONAL_METHODS: Record<Capability, keyof MarketDataProvider> = {
  'flow': 'getFlow',
  'capital-distribution': 'getCapitalDistribution',
  'positions': 'getPositions',
  'watchlist': 'getWatchlistSymbols',
  'portfolio': 'getPortfolio',
  'earnings-calendar': 'getEarningsCalendar',
  'macro-calendar': 'getMacroCalendar',
};

describe('marketdata registry', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to the longbridge provider', () => {
    vi.stubEnv('MARKET_PROVIDER', '');
    expect(getProvider().name).toBe('longbridge');
  });

  it('selects the provider named by MARKET_PROVIDER', () => {
    vi.stubEnv('MARKET_PROVIDER', 'longbridge');
    expect(getProvider().name).toBe('longbridge');
  });

  it('rejects an unknown MARKET_PROVIDER with a hint listing the options', () => {
    vi.stubEnv('MARKET_PROVIDER', 'yahoo');
    expect(() => getProvider()).toThrow('unknown MARKET_PROVIDER: yahoo');
  });

  it('routes US/HK/CN to longbridge by default', () => {
    expect(getProvider('US').name).toBe('longbridge');
    expect(getProvider('HK').name).toBe('longbridge');
    expect(getProvider('CN').name).toBe('longbridge');
  });

  it('MARKET_PROVIDER sets the provider for every market', () => {
    vi.stubEnv('MARKET_PROVIDER', 'longbridge');
    expect(getProvider('US').name).toBe('longbridge');
    expect(getProvider('HK').name).toBe('longbridge');
    expect(getProvider('CN').name).toBe('longbridge');
  });

  it('a per-market override wins for its own market only', () => {
    vi.stubEnv('MARKET_PROVIDER', 'longbridge');
    vi.stubEnv('MARKET_PROVIDER_HK', 'yahoo');
    expect(getProvider('US').name).toBe('longbridge');
    expect(() => getProvider('HK')).toThrow('unknown MARKET_PROVIDER: yahoo');
    expect(getProvider('CN').name).toBe('longbridge');
  });

  it('rejects an unknown per-market override with the same hint', () => {
    vi.stubEnv('MARKET_PROVIDER_CN', 'yahoo');
    expect(() => getProvider('CN')).toThrow('unknown MARKET_PROVIDER: yahoo');
  });
});

describe('provider contract', () => {
  for (const name of listProviders()) {
    it(`${name}: declared capabilities match implemented optional methods`, () => {
      vi.stubEnv('MARKET_PROVIDER', name);
      const provider = getProvider();
      for (const [capability, method] of Object.entries(OPTIONAL_METHODS)) {
        const declared = provider.capabilities.has(capability as Capability);
        const implemented = typeof provider[method as keyof MarketDataProvider] === 'function';
        expect(declared, `${name}.${method} vs capability "${capability}"`).toBe(implemented);
      }
      vi.unstubAllEnvs();
    });

    it(`${name}: implements every core method`, () => {
      vi.stubEnv('MARKET_PROVIDER', name);
      const provider = getProvider();
      expect(typeof provider.getKline).toBe('function');
      expect(typeof provider.getQuotes).toBe('function');
      expect(typeof provider.getNews).toBe('function');
      vi.unstubAllEnvs();
    });
  }
});
