import { ClientError } from "../../errors.js";
import { longbridgeProvider } from "./longbridge.js";
import type { MarketDataProvider } from "./types.js";

const providers: Record<string, MarketDataProvider> = {
  longbridge: longbridgeProvider,
};

export function getProvider(): MarketDataProvider {
  const name = process.env.MARKET_PROVIDER || "longbridge";
  const provider = providers[name];
  if (!provider) {
    throw new ClientError(
      `unknown MARKET_PROVIDER: ${name}`,
      `available providers: ${Object.keys(providers).join(", ")}`,
    );
  }
  return provider;
}

export function listProviders(): string[] {
  return Object.keys(providers);
}
