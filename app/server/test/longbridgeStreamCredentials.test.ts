import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CredentialProvider } from "../src/services/credentials/types.js";

const sdk = vi.hoisted(() => {
  let nextCtxId = 0;
  return {
    nextCtxId: () => ++nextCtxId,
    fromApikey: vi.fn((appKey: string, appSecret: string, accessToken: string) => ({ kind: "apikey", appKey, appSecret, accessToken })),
    quoteContextNew: vi.fn(),
    tradeContextNew: vi.fn(),
  };
});

function fakeQuoteContext(config: unknown) {
  return {
    id: sdk.nextCtxId(),
    config,
    setOnQuote: vi.fn(),
    setOnCandlestick: vi.fn(),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    quote: vi.fn().mockResolvedValue([]),
  };
}

function fakeTradeContext(config: unknown) {
  return { id: sdk.nextCtxId(), config };
}

vi.mock("longbridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("longbridge")>();
  return {
    ...actual,
    Config: { ...actual.Config, fromApikey: sdk.fromApikey, fromOAuth: vi.fn() },
    OAuth: { ...actual.OAuth, build: vi.fn() },
    QuoteContext: { ...actual.QuoteContext, new: sdk.quoteContextNew },
    TradeContext: { ...actual.TradeContext, new: sdk.tradeContextNew },
  };
});

function makeProvider(initial: { appKey: string; appSecret: string; accessToken: string } | null): {
  provider: CredentialProvider;
  fire: () => void;
} {
  let creds = initial;
  let listener: (() => void) | null = null;
  const provider: CredentialProvider = {
    getLongbridgeCredentials: async () => creds,
    onChange: (cb) => {
      listener = cb;
      return () => {
        listener = null;
      };
    },
  };
  return {
    provider,
    fire: () => listener?.(),
    setCreds(next: typeof creds) {
      creds = next;
    },
  } as { provider: CredentialProvider; fire: () => void; setCreds: (next: typeof initial) => void };
}

describe("LongbridgeStream credential swap", () => {
  beforeEach(() => {
    vi.resetModules();
    sdk.fromApikey.mockClear();
    sdk.quoteContextNew.mockReset();
    sdk.tradeContextNew.mockReset();
    sdk.quoteContextNew.mockImplementation(async (config: unknown) => fakeQuoteContext(config));
    sdk.tradeContextNew.mockImplementation(async (config: unknown) => fakeTradeContext(config));
  });

  it("reconstructs quote and trade clients with fresh credentials after the provider fires onChange", async () => {
    const holder = makeProvider({ appKey: "k1", appSecret: "s1", accessToken: "t1" });
    const { setCredentialProviderForTests } = await import("../src/services/credentials/registry.js");
    setCredentialProviderForTests(holder.provider);

    const { LongbridgeStream } = await import("../src/services/marketdata/longbridgeStream.js");
    const stream = new LongbridgeStream();

    const quoteCtx1 = await stream.getQuoteContext();
    const tradeCtx1 = await stream.getTradeContext();
    expect((quoteCtx1 as unknown as { config: unknown }).config).toMatchObject({ appKey: "k1" });

    const quoteCtx1Again = await stream.getQuoteContext();
    expect(quoteCtx1Again).toBe(quoteCtx1);

    (holder as unknown as { setCreds: (c: unknown) => void }).setCreds({ appKey: "k2", appSecret: "s2", accessToken: "t2" });
    holder.fire();

    const quoteCtx2 = await stream.getQuoteContext();
    const tradeCtx2 = await stream.getTradeContext();

    expect(quoteCtx2).not.toBe(quoteCtx1);
    expect(tradeCtx2).not.toBe(tradeCtx1);
    expect((quoteCtx2 as unknown as { config: unknown }).config).toMatchObject({ appKey: "k2" });

    setCredentialProviderForTests(null);
  });

  it("moves from restricted (null creds) to configured after onChange fires with real credentials", async () => {
    const holder = makeProvider(null);
    const { setCredentialProviderForTests } = await import("../src/services/credentials/registry.js");
    setCredentialProviderForTests(holder.provider);

    const { LongbridgeStream } = await import("../src/services/marketdata/longbridgeStream.js");
    const { NoCredentialsError } = await import("../src/services/credentials/errors.js");
    const stream = new LongbridgeStream();

    await expect(stream.getQuoteContext()).rejects.toBeInstanceOf(NoCredentialsError);

    (holder as unknown as { setCreds: (c: unknown) => void }).setCreds({ appKey: "k3", appSecret: "s3", accessToken: "t3" });
    holder.fire();

    const quoteCtx = await stream.getQuoteContext();
    expect((quoteCtx as unknown as { config: unknown }).config).toMatchObject({ appKey: "k3" });

    setCredentialProviderForTests(null);
  });

  afterEach(async () => {
    const { setCredentialProviderForTests } = await import("../src/services/credentials/registry.js");
    setCredentialProviderForTests(null);
  });
});
