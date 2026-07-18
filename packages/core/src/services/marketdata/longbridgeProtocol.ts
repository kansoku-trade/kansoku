import { gunzipSync } from "node:zlib";
import type { FlowRow, RawBar } from "@kansoku/shared/types";
import type { ExtendedQuote, RawCapitalDistribution, RawQuote } from "./types.js";

export const COMMAND_AUTH = 2;
export const COMMAND_RECONNECT = 3;
export const COMMAND_SUBSCRIBE = 6;
export const COMMAND_UNSUBSCRIBE = 7;
export const COMMAND_QUERY_SECURITY_STATIC = 10;
export const COMMAND_QUERY_SECURITY_QUOTE = 11;
export const COMMAND_QUERY_CANDLESTICK = 19;
export const COMMAND_QUERY_CAPITAL_FLOW = 24;
export const COMMAND_QUERY_CAPITAL_DISTRIBUTION = 25;
export const COMMAND_PUSH_QUOTE = 101;
export const COMMAND_PUSH_TRADE = 104;

export const SUB_TYPE_QUOTE = 1;
export const SUB_TYPE_TRADE = 4;

export const TRADE_SESSIONS_INTRADAY = 0;
export const TRADE_SESSIONS_ALL = 100;

const CANDLESTICK_PERIODS: Record<string, number> = {
  "1m": 1,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "60m": 60,
  "1h": 60,
  day: 1000,
  week: 2000,
  month: 3000,
  year: 4000,
};

export function candlestickPeriod(period: string): number {
  const value = CANDLESTICK_PERIODS[period];
  if (!value) throw new Error(`Unsupported candlestick period: ${period}`);
  return value;
}

export const TRADE_SESSION_INTRADAY = 0;
export const TRADE_SESSION_PRE = 1;
export const TRADE_SESSION_POST = 2;
export const TRADE_SESSION_OVERNIGHT = 3;

export type ProtocolPacket =
  | { type: "request"; command: number; requestId: number; timeoutMs: number; body: Uint8Array }
  | { type: "response"; command: number; requestId: number; status: number; body: Uint8Array }
  | { type: "push"; command: number; body: Uint8Array };

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function u24(value: number): Uint8Array {
  return Uint8Array.of((value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function u32(value: number): Uint8Array {
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function readU24(data: Uint8Array, offset: number): number {
  return (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
}

function readU32(data: Uint8Array, offset: number): number {
  return data[offset] * 0x1000000 + (data[offset + 1] << 16) + (data[offset + 2] << 8) + data[offset + 3];
}

export function encodeRequest(command: number, requestId: number, timeoutMs: number, body: Uint8Array): Uint8Array {
  return concat([
    Uint8Array.of(1, command),
    u32(requestId),
    Uint8Array.of((timeoutMs >>> 8) & 0xff, timeoutMs & 0xff),
    u24(body.length),
    body,
  ]);
}

export function decodePacket(input: Uint8Array): ProtocolPacket {
  if (input.length < 2) throw new Error("Longbridge packet is too short");
  const header = input[0];
  const type = header & 0x0f;
  const gzip = (header & 0x20) !== 0;
  const command = input[1];
  let body: Uint8Array;
  let packet: ProtocolPacket;
  if (type === 2) {
    if (input.length < 10) throw new Error("Longbridge response packet is too short");
    const requestId = readU32(input, 2);
    const status = input[6];
    const length = readU24(input, 7);
    body = input.subarray(10, 10 + length);
    packet = { type: "response", command, requestId, status, body };
  } else if (type === 3) {
    if (input.length < 5) throw new Error("Longbridge push packet is too short");
    const length = readU24(input, 2);
    body = input.subarray(5, 5 + length);
    packet = { type: "push", command, body };
  } else {
    throw new Error(`Unsupported Longbridge packet type: ${type}`);
  }
  if (gzip) packet.body = Uint8Array.from(gunzipSync(packet.body));
  return packet;
}

function varint(value: number | bigint): Uint8Array {
  let current = BigInt(value);
  const out: number[] = [];
  while (current >= 0x80n) {
    out.push(Number(current & 0x7fn) | 0x80);
    current >>= 7n;
  }
  out.push(Number(current));
  return Uint8Array.from(out);
}

function fieldVarint(field: number, value: number | bigint): Uint8Array {
  return concat([varint(field << 3), varint(value)]);
}

function fieldBytes(field: number, value: Uint8Array): Uint8Array {
  return concat([varint((field << 3) | 2), varint(value.length), value]);
}

function fieldString(field: number, value: string): Uint8Array {
  return fieldBytes(field, Buffer.from(value));
}

function mapStringEntry(field: number, key: string, value: string): Uint8Array {
  return fieldBytes(field, concat([fieldString(1, key), fieldString(2, value)]));
}

export function encodeAuthRequest(token: string, metadata: Record<string, string>): Uint8Array {
  return concat([fieldString(1, token), ...Object.entries(metadata).map(([key, value]) => mapStringEntry(2, key, value))]);
}

export function encodeReconnectRequest(sessionId: string, metadata: Record<string, string>): Uint8Array {
  return concat([fieldString(1, sessionId), ...Object.entries(metadata).map(([key, value]) => mapStringEntry(2, key, value))]);
}

export function encodeSubscribeRequest(symbols: string[], subTypes: number[], firstPush: boolean): Uint8Array {
  return concat([
    ...symbols.map((symbol) => fieldString(1, symbol)),
    ...subTypes.map((type) => fieldVarint(2, type)),
    fieldVarint(3, firstPush ? 1 : 0),
  ]);
}

export function encodeUnsubscribeRequest(symbols: string[], subTypes: number[], all = false): Uint8Array {
  return concat([
    ...symbols.map((symbol) => fieldString(1, symbol)),
    ...subTypes.map((type) => fieldVarint(2, type)),
    fieldVarint(3, all ? 1 : 0),
  ]);
}

export function encodeMultiSecurityRequest(symbols: string[]): Uint8Array {
  return concat(symbols.map((symbol) => fieldString(1, symbol)));
}

export function encodeCandlestickRequest(symbol: string, period: number, count: number, tradeSessions: number): Uint8Array {
  return concat([
    fieldString(1, symbol),
    fieldVarint(2, period),
    fieldVarint(3, count),
    ...(tradeSessions ? [fieldVarint(5, tradeSessions)] : []),
  ]);
}

interface Field {
  number: number;
  wire: number;
  value: bigint | Uint8Array;
}

function readVarint(data: Uint8Array, start: number): { value: bigint; next: number } {
  let value = 0n;
  let shift = 0n;
  let offset = start;
  while (offset < data.length) {
    const byte = data[offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, next: offset };
    shift += 7n;
  }
  throw new Error("Truncated protobuf varint");
}

function fields(data: Uint8Array): Field[] {
  const out: Field[] = [];
  let offset = 0;
  while (offset < data.length) {
    const tag = readVarint(data, offset);
    offset = tag.next;
    const number = Number(tag.value >> 3n);
    const wire = Number(tag.value & 7n);
    if (wire === 0) {
      const decoded = readVarint(data, offset);
      out.push({ number, wire, value: decoded.value });
      offset = decoded.next;
    } else if (wire === 2) {
      const size = readVarint(data, offset);
      offset = size.next;
      const end = offset + Number(size.value);
      out.push({ number, wire, value: data.subarray(offset, end) });
      offset = end;
    } else if (wire === 1) {
      offset += 8;
    } else if (wire === 5) {
      offset += 4;
    } else {
      throw new Error(`Unsupported protobuf wire type: ${wire}`);
    }
  }
  return out;
}

function stringValue(field: Field | undefined): string {
  return field?.value instanceof Uint8Array ? Buffer.from(field.value).toString("utf8") : "";
}

function numberValue(field: Field | undefined): number {
  return typeof field?.value === "bigint" ? Number(field.value) : 0;
}

export function decodeSessionResponse(body: Uint8Array): { sessionId: string; expires: number } {
  const decoded = fields(body);
  return {
    sessionId: stringValue(decoded.find((field) => field.number === 1)),
    expires: numberValue(decoded.find((field) => field.number === 2)),
  };
}

export interface ProtocolQuote {
  symbol: string;
  sequence: number;
  lastDone: number;
  timestamp: number;
  volume: number;
  currentVolume: number;
  turnover: number;
  currentTurnover: number;
  tradeSession: number;
  tag: number;
}

export function decodePushQuote(body: Uint8Array): ProtocolQuote {
  const decoded = fields(body);
  const get = (number: number) => decoded.find((field) => field.number === number);
  return {
    symbol: stringValue(get(1)),
    sequence: numberValue(get(2)),
    lastDone: Number(stringValue(get(3))),
    timestamp: numberValue(get(7)),
    volume: numberValue(get(8)),
    turnover: Number(stringValue(get(9))),
    tradeSession: numberValue(get(11)),
    currentVolume: numberValue(get(12)),
    currentTurnover: Number(stringValue(get(13))),
    tag: numberValue(get(14)),
  };
}

export interface ProtocolTrade {
  price: number;
  volume: number;
  timestamp: number;
  tradeSession: number;
}

export interface ProtocolTradePush {
  symbol: string;
  sequence: number;
  trades: ProtocolTrade[];
}

function decodeTrade(body: Uint8Array): ProtocolTrade {
  const decoded = fields(body);
  const get = (number: number) => decoded.find((field) => field.number === number);
  return {
    price: Number(stringValue(get(1))),
    volume: numberValue(get(2)),
    timestamp: numberValue(get(3)),
    tradeSession: numberValue(get(6)),
  };
}

function bytesValue(field: Field | undefined): Uint8Array | null {
  return field?.value instanceof Uint8Array ? field.value : null;
}

function isoTime(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

function decodePrePostQuote(body: Uint8Array): ExtendedQuote {
  const decoded = fields(body);
  const get = (number: number) => decoded.find((field) => field.number === number);
  const timestamp = numberValue(get(2));
  const last = stringValue(get(1));
  const prevClose = stringValue(get(7));
  return {
    ...(last ? { last } : {}),
    ...(prevClose ? { prev_close: prevClose } : {}),
    ...(timestamp > 0 ? { timestamp: isoTime(timestamp) } : {}),
  };
}

function changePercentage(last: string, prevClose: string): string {
  const lastNum = Number(last);
  const prev = Number(prevClose);
  if (!prev || !Number.isFinite(lastNum) || !Number.isFinite(prev)) return "0";
  return ((lastNum / prev - 1) * 100).toFixed(3);
}

function decodeSecurityQuote(body: Uint8Array): RawQuote {
  const decoded = fields(body);
  const get = (number: number) => decoded.find((field) => field.number === number);
  const last = stringValue(get(2));
  const prevClose = stringValue(get(3));
  const pre = bytesValue(get(11));
  const post = bytesValue(get(12));
  const overnight = bytesValue(get(13));
  return {
    symbol: stringValue(get(1)),
    last,
    prev_close: prevClose,
    change_percentage: changePercentage(last, prevClose),
    ...(pre ? { pre_market: decodePrePostQuote(pre) } : {}),
    ...(post ? { post_market: decodePrePostQuote(post) } : {}),
    ...(overnight ? { overnight: decodePrePostQuote(overnight) } : {}),
  };
}

export function decodeSecurityQuoteResponse(body: Uint8Array): RawQuote[] {
  return fields(body)
    .filter((field) => field.number === 1 && field.value instanceof Uint8Array)
    .map((field) => decodeSecurityQuote(field.value as Uint8Array));
}

export function decodeCandlestickResponse(body: Uint8Array): RawBar[] {
  return fields(body)
    .filter((field) => field.number === 2 && field.value instanceof Uint8Array)
    .map((field) => {
      const decoded = fields(field.value as Uint8Array);
      const get = (number: number) => decoded.find((item) => item.number === number);
      return {
        time: isoTime(numberValue(get(7))),
        open: Number(stringValue(get(2))),
        high: Number(stringValue(get(4))),
        low: Number(stringValue(get(3))),
        close: Number(stringValue(get(1))),
        volume: numberValue(get(5)),
      };
    });
}

export function decodeStaticNameResponse(body: Uint8Array): Array<{ symbol: string; name: string }> {
  return fields(body)
    .filter((field) => field.number === 1 && field.value instanceof Uint8Array)
    .map((field) => {
      const decoded = fields(field.value as Uint8Array);
      const get = (number: number) => stringValue(decoded.find((item) => item.number === number));
      return { symbol: get(1), name: get(2) || get(3) };
    });
}

export function decodeCapitalFlowResponse(body: Uint8Array): FlowRow[] {
  return fields(body)
    .filter((field) => field.number === 2 && field.value instanceof Uint8Array)
    .map((field) => {
      const decoded = fields(field.value as Uint8Array);
      return {
        time: isoTime(numberValue(decoded.find((item) => item.number === 2))),
        inflow: stringValue(decoded.find((item) => item.number === 1)),
      };
    });
}

function decodeCapitalBucket(body: Uint8Array | null): { large: string; medium: string; small: string } {
  const decoded = body ? fields(body) : [];
  const get = (number: number) => stringValue(decoded.find((field) => field.number === number));
  return { large: get(1), medium: get(2), small: get(3) };
}

export function decodeCapitalDistributionResponse(body: Uint8Array): RawCapitalDistribution {
  const decoded = fields(body);
  const get = (number: number) => decoded.find((field) => field.number === number);
  return {
    symbol: stringValue(get(1)),
    timestamp: isoTime(numberValue(get(2))),
    capital_in: decodeCapitalBucket(bytesValue(get(3))),
    capital_out: decodeCapitalBucket(bytesValue(get(4))),
  };
}

export function decodePushTrades(body: Uint8Array): ProtocolTradePush {
  const decoded = fields(body);
  return {
    symbol: stringValue(decoded.find((field) => field.number === 1)),
    sequence: numberValue(decoded.find((field) => field.number === 2)),
    trades: decoded
      .filter((field) => field.number === 3 && field.value instanceof Uint8Array)
      .map((field) => decodeTrade(field.value as Uint8Array)),
  };
}
