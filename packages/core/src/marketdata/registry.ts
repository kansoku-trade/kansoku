import { ClientError } from '../platform/errors.js';
import type { Market } from '../symbols/symbol.utils.js';
import { longbridgeProvider } from './longbridge.js';
import { getLongbridgeStream, resetLongbridgeStream } from './longbridgeStream.js';
import type { QuoteStream } from './quoteStream.js';
import { resetSharedQuoteSocket } from './sharedSocket.js';
import type { MarketDataProvider } from './types.js';
import { yahooProvider } from './yahoo/provider.js';
import { getYahooStream, resetYahooStream } from './yahoo/stream.js';

const providers: Record<string, MarketDataProvider> = {
  longbridge: longbridgeProvider,
  yahoo: yahooProvider,
};

const streamFactories: Record<string, () => QuoteStream> = {
  longbridge: getLongbridgeStream,
  yahoo: getYahooStream,
};

let defaultProviderName = 'longbridge';

const routingChangeListeners = new Set<() => void>();

export function setDefaultProviderName(name: string): void {
  defaultProviderName = name;
}

export function getDefaultProviderName(): string {
  return defaultProviderName;
}

export function onProviderRoutingChanged(listener: () => void): () => void {
  routingChangeListeners.add(listener);
  return () => {
    routingChangeListeners.delete(listener);
  };
}

export function emitProviderRoutingChanged(): void {
  for (const listener of routingChangeListeners) listener();
}

function resolveProviderName(market: Market): string {
  return (
    process.env[`MARKET_PROVIDER_${market}`] || process.env.MARKET_PROVIDER || defaultProviderName
  );
}

export function getProvider(market: Market = 'US'): MarketDataProvider {
  const name = resolveProviderName(market);
  const provider = providers[name];
  if (!provider) {
    throw new ClientError(
      `unknown MARKET_PROVIDER: ${name}`,
      `available providers: ${Object.keys(providers).join(', ')}`,
    );
  }
  return provider;
}

export function getStream(market: Market = 'US'): QuoteStream {
  const name = resolveProviderName(market);
  const factory = streamFactories[name];
  if (!factory) {
    throw new ClientError(
      `unknown MARKET_PROVIDER: ${name}`,
      `available stream providers: ${Object.keys(streamFactories).join(', ')}`,
    );
  }
  return factory();
}

export function listProviders(): string[] {
  return Object.keys(providers);
}

export function disposeMarketData(): void {
  resetLongbridgeStream();
  resetYahooStream();
  resetSharedQuoteSocket();
}
