import { ClientError } from '../platform/errors.js';
import type { Market } from '../symbols/symbol.utils.js';
import { longbridgeProvider } from './longbridge.js';
import { getLongbridgeStream, resetLongbridgeStream } from './longbridgeStream.js';
import type { QuoteStream } from './quoteStream.js';
import { resetSharedQuoteSocket } from './sharedSocket.js';
import type { MarketDataProvider } from './types.js';

const providers: Record<string, MarketDataProvider> = {
  longbridge: longbridgeProvider,
};

const streamFactories: Record<string, () => QuoteStream> = {
  longbridge: getLongbridgeStream,
};

function resolveProviderName(market: Market): string {
  return process.env[`MARKET_PROVIDER_${market}`] || process.env.MARKET_PROVIDER || 'longbridge';
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
  resetSharedQuoteSocket();
}
