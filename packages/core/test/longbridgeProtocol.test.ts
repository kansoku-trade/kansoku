import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  candlestickPeriod,
  decodeCandlestickResponse,
  decodeCapitalDistributionResponse,
  decodeCapitalFlowResponse,
  decodeStaticNameResponse,
  decodePacket,
  decodePushQuote,
  decodePushTrades,
  decodeSecurityQuoteResponse,
  encodeCandlestickRequest,
  encodeMultiSecurityRequest,
  encodeRequest,
  encodeSubscribeRequest,
} from "../src/services/marketdata/longbridgeProtocol.js";

const bytes = (...values: number[]) => Uint8Array.from(values);

function str(field: number, value: string): number[] {
  const body = [...Buffer.from(value)];
  return [(field << 3) | 2, body.length, ...body];
}

function num(field: number, value: number): number[] {
  return [field << 3, value];
}

function msg(field: number, body: number[]): number[] {
  return [(field << 3) | 2, body.length, ...body];
}

describe("Longbridge realtime protocol", () => {
  it("encodes request packet fields in network byte order", () => {
    expect([...encodeRequest(6, 0x01020304, 5000, bytes(1, 2))]).toEqual([
      1, 6, 1, 2, 3, 4, 0x13, 0x88, 0, 0, 2, 1, 2,
    ]);
  });

  it("decodes response and gzip push packets", () => {
    const response = decodePacket(bytes(2, 6, 0, 0, 0, 7, 0, 0, 0, 1, 9));
    expect(response).toEqual({ type: "response", command: 6, requestId: 7, status: 0, body: bytes(9) });

    const zipped = gzipSync(bytes(1, 2, 3));
    const push = decodePacket(bytes(0x23, 101, (zipped.length >>> 16) & 0xff, (zipped.length >>> 8) & 0xff, zipped.length & 0xff, ...zipped));
    expect(push).toEqual({ type: "push", command: 101, body: bytes(1, 2, 3) });
  });

  it("encodes subscription symbols and enum values", () => {
    expect([...encodeSubscribeRequest(["A.US"], [1, 4], true)]).toEqual([
      ...str(1, "A.US"),
      ...num(2, 1),
      ...num(2, 4),
      ...num(3, 1),
    ]);
  });

  it("encodes security quote and candlestick query requests", () => {
    expect([...encodeMultiSecurityRequest(["AAA.US", "BBB.US"])]).toEqual([...str(1, "AAA.US"), ...str(1, "BBB.US")]);
    expect([...encodeCandlestickRequest("A.US", candlestickPeriod("5m"), 2, 100)]).toEqual([
      ...str(1, "A.US"),
      ...num(2, 5),
      ...num(3, 2),
      ...num(5, 100),
    ]);
    expect([...encodeCandlestickRequest("A.US", candlestickPeriod("5m"), 2, 0)]).toEqual([
      ...str(1, "A.US"),
      ...num(2, 5),
      ...num(3, 2),
    ]);
    expect(() => candlestickPeriod("3m")).toThrow("Unsupported candlestick period");
  });

  it("decodes security quote responses with extended-session sub-quotes", () => {
    const prePost = [...str(1, "604"), ...num(2, 100), ...str(7, "600.31")];
    const quote = [...str(1, "SMH.US"), ...str(2, "604"), ...str(3, "600.31"), ...msg(11, prePost)];
    const decoded = decodeSecurityQuoteResponse(bytes(...msg(1, quote)));
    expect(decoded).toEqual([
      {
        symbol: "SMH.US",
        last: "604",
        prev_close: "600.31",
        change_percentage: "0.615",
        pre_market: { last: "604", prev_close: "600.31", timestamp: "1970-01-01T00:01:40.000Z" },
      },
    ]);
  });

  it("decodes candlestick responses into RawBar rows", () => {
    const candle = [...str(1, "10.5"), ...str(2, "10"), ...str(3, "9.5"), ...str(4, "11"), ...num(5, 42), ...num(7, 60)];
    expect(decodeCandlestickResponse(bytes(...str(1, "A.US"), ...msg(2, candle)))).toEqual([
      { time: "1970-01-01T00:01:00.000Z", open: 10, high: 11, low: 9.5, close: 10.5, volume: 42 },
    ]);
  });

  it("decodes capital flow intraday responses into FlowRow rows", () => {
    const line = [...str(1, "12345.5"), ...num(2, 60)];
    expect(decodeCapitalFlowResponse(bytes(...str(1, "A.US"), ...msg(2, line)))).toEqual([
      { time: "1970-01-01T00:01:00.000Z", inflow: "12345.5" },
    ]);
  });

  it("decodes capital distribution responses with in/out buckets", () => {
    const capitalIn = [...str(1, "1"), ...str(2, "2"), ...str(3, "3")];
    const capitalOut = [...str(1, "4"), ...str(2, "5"), ...str(3, "6")];
    expect(
      decodeCapitalDistributionResponse(bytes(...str(1, "A.US"), ...num(2, 60), ...msg(3, capitalIn), ...msg(4, capitalOut))),
    ).toEqual({
      symbol: "A.US",
      timestamp: "1970-01-01T00:01:00.000Z",
      capital_in: { large: "1", medium: "2", small: "3" },
      capital_out: { large: "4", medium: "5", small: "6" },
    });
  });

  it("decodes static info responses into symbol/name pairs preferring name_cn", () => {
    const info = [...str(1, "MRVL.US"), ...str(2, "迈威尔科技"), ...str(3, "Marvell Technology")];
    const noCn = [...str(1, "XXXX.US"), ...str(3, "Fallback Inc")];
    expect(decodeStaticNameResponse(bytes(...msg(1, info), ...msg(1, noCn)))).toEqual([
      { symbol: "MRVL.US", name: "迈威尔科技" },
      { symbol: "XXXX.US", name: "Fallback Inc" },
    ]);
  });

  it("decodes quote and trade push protobuf messages", () => {
    const quote = bytes(
      ...str(1, "AAPL.US"),
      ...num(2, 2),
      ...str(3, "210.5"),
      ...num(7, 100),
      ...num(8, 50),
      ...str(9, "1000"),
      ...num(11, 1),
      ...num(12, 5),
      ...str(13, "1052.5"),
    );
    expect(decodePushQuote(quote)).toMatchObject({
      symbol: "AAPL.US",
      lastDone: 210.5,
      timestamp: 100,
      tradeSession: 1,
      currentVolume: 5,
    });

    const trade = bytes(...str(1, "210.6"), ...num(2, 3), ...num(3, 101), ...num(6, 1));
    const push = bytes(...str(1, "AAPL.US"), ...num(2, 3), 0x1a, trade.length, ...trade);
    expect(decodePushTrades(push)).toEqual({
      symbol: "AAPL.US",
      sequence: 3,
      trades: [{ price: 210.6, volume: 3, timestamp: 101, tradeSession: 1 }],
    });
  });
});

