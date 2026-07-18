import type { FlowRow, RawBar } from "@kansoku/shared/types";
import { readLongbridgeToken, type LongbridgeToken } from "../longbridgeToken.js";
import type { RawCapitalDistribution, RawQuote } from "./types.js";
import {
  candlestickPeriod,
  COMMAND_AUTH,
  COMMAND_PUSH_QUOTE,
  COMMAND_PUSH_TRADE,
  COMMAND_QUERY_CANDLESTICK,
  COMMAND_QUERY_CAPITAL_DISTRIBUTION,
  COMMAND_QUERY_CAPITAL_FLOW,
  COMMAND_QUERY_SECURITY_QUOTE,
  COMMAND_QUERY_SECURITY_STATIC,
  COMMAND_RECONNECT,
  COMMAND_SUBSCRIBE,
  COMMAND_UNSUBSCRIBE,
  decodeCandlestickResponse,
  decodeCapitalDistributionResponse,
  decodeCapitalFlowResponse,
  decodePacket,
  decodeStaticNameResponse,
  decodePushQuote,
  decodePushTrades,
  decodeSecurityQuoteResponse,
  decodeSessionResponse,
  encodeAuthRequest,
  encodeCandlestickRequest,
  encodeMultiSecurityRequest,
  encodeReconnectRequest,
  encodeRequest,
  encodeSubscribeRequest,
  encodeUnsubscribeRequest,
  TRADE_SESSIONS_ALL,
  TRADE_SESSIONS_INTRADAY,
  type ProtocolQuote,
  type ProtocolTradePush,
} from "./longbridgeProtocol.js";

const QUERY_TIMEOUT_MS = 10_000;

interface SocketEvent {
  data?: unknown;
}

export interface WebSocketLike {
  binaryType: string;
  readyState: number;
  addEventListener(type: "open" | "message" | "close" | "error", listener: (event: SocketEvent) => void): void;
  send(data: Uint8Array): void;
  close(): void;
}

export interface LongbridgeSocketDeps {
  createSocket?: (url: string) => WebSocketLike;
  loadToken?: () => Promise<LongbridgeToken>;
  getOtp?: (token: LongbridgeToken) => Promise<string>;
  endpoint?: string;
}

type Pending = {
  command: number;
  resolve: (body: Uint8Array) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

function defaultCreateSocket(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike;
}

async function fetchSocketOtp(token: LongbridgeToken): Promise<string> {
  const httpBase = process.env.LONGBRIDGE_HTTP_URL ?? "https://openapi.longbridge.com";
  const response = await fetch(`${httpBase.replace(/\/$/, "")}/v2/socket/token`, {
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
  if (!response.ok) throw new Error(`Longbridge socket OTP request failed: HTTP ${response.status}`);
  const payload = (await response.json()) as { code?: number; message?: string; data?: { otp?: string } };
  const otp = payload.data?.otp;
  if (payload.code !== 0 || !otp) throw new Error(`Longbridge socket OTP request failed: ${payload.message ?? "unknown error"}`);
  return otp;
}

async function messageBytes(data: unknown): Promise<Uint8Array> {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (typeof Blob !== "undefined" && data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  throw new Error("Unsupported Longbridge WebSocket message");
}

export class LongbridgeQuoteSocket {
  private socket: WebSocketLike | null = null;
  private connecting: Promise<void> | null = null;
  private requestId = 0;
  private pending = new Map<number, Pending>();
  private session: { id: string; deadline: number } | null = null;
  private closedExplicitly = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private quoteListeners = new Set<(quote: ProtocolQuote) => void>();
  private tradeListeners = new Set<(trade: ProtocolTradePush) => void>();
  private desired = new Map<string, Set<number>>();

  constructor(private readonly deps: LongbridgeSocketDeps = {}) {}

  onQuote(listener: (quote: ProtocolQuote) => void): () => void {
    this.quoteListeners.add(listener);
    return () => this.quoteListeners.delete(listener);
  }

  onTrade(listener: (trade: ProtocolTradePush) => void): () => void {
    this.tradeListeners.add(listener);
    return () => this.tradeListeners.delete(listener);
  }

  async connect(): Promise<void> {
    if (this.socket?.readyState === 1) return;
    if (this.connecting) return this.connecting;
    this.closedExplicitly = false;
    this.connecting = this.openAndAuthenticate().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async openAndAuthenticate(): Promise<void> {
    const token = await (this.deps.loadToken ?? readLongbridgeToken)();
    const base = this.deps.endpoint ?? process.env.LONGBRIDGE_QUOTE_WS_URL ?? "wss://openapi-quote.longbridge.com/v2";
    const url = new URL(base);
    url.searchParams.set("version", "1");
    url.searchParams.set("codec", "1");
    url.searchParams.set("platform", "9");
    const socket = (this.deps.createSocket ?? defaultCreateSocket)(url.toString());
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    socket.addEventListener("message", (event) => void this.handleMessage(event.data));
    socket.addEventListener("close", () => this.handleClose(new Error("Longbridge WebSocket closed")));

    try {
      await new Promise<void>((resolve, reject) => {
        const onOpen = () => resolve();
        const onError = () => reject(new Error("Longbridge WebSocket connection failed"));
        socket.addEventListener("open", onOpen);
        socket.addEventListener("error", onError);
      });

      const metadata = { need_over_night_quote: "true" };
      let sessionBody: Uint8Array;
      let reconnect = false;
      if (this.session && this.session.deadline > Date.now()) {
        try {
          sessionBody = await this.request(COMMAND_RECONNECT, encodeReconnectRequest(this.session.id, metadata), 5_000);
          reconnect = true;
        } catch {
          const otp = await (this.deps.getOtp ?? fetchSocketOtp)(token);
          sessionBody = await this.request(COMMAND_AUTH, encodeAuthRequest(otp, metadata), 5_000);
        }
      } else {
        const otp = await (this.deps.getOtp ?? fetchSocketOtp)(token);
        sessionBody = await this.request(COMMAND_AUTH, encodeAuthRequest(otp, metadata), 5_000);
      }
      const next = decodeSessionResponse(sessionBody);
      this.session = {
        id: next.sessionId,
        deadline: reconnect || next.expires < 1_000_000_000_000 ? Date.now() + next.expires : next.expires,
      };
      this.reconnectAttempt = 0;
      await this.restoreSubscriptions();
    } catch (error) {
      if (this.socket === socket) this.socket = null;
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      throw error;
    }
  }

  private request(command: number, body: Uint8Array, timeoutMs = 30_000): Promise<Uint8Array> {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1) return Promise.reject(new Error("Longbridge WebSocket is not connected"));
    const requestId = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Longbridge request timed out: ${command}`));
      }, timeoutMs);
      this.pending.set(requestId, { command, resolve, reject, timer });
      socket.send(encodeRequest(command, requestId, timeoutMs, body));
    });
  }

  private async handleMessage(data: unknown): Promise<void> {
    try {
      const packet = decodePacket(await messageBytes(data));
      if (packet.type === "response") {
        const pending = this.pending.get(packet.requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(packet.requestId);
        if (packet.status === 0) pending.resolve(packet.body);
        else pending.reject(new Error(`Longbridge response failed: command=${packet.command} status=${packet.status}`));
        return;
      }
      if (packet.command === COMMAND_PUSH_QUOTE) {
        const quote = decodePushQuote(packet.body);
        for (const listener of this.quoteListeners) listener(quote);
      } else if (packet.command === COMMAND_PUSH_TRADE) {
        const trade = decodePushTrades(packet.body);
        for (const listener of this.tradeListeners) listener(trade);
      }
    } catch (error) {
      console.warn("[longbridge-socket] invalid message", error instanceof Error ? error.message : error);
    }
  }

  private handleClose(error: Error): void {
    if (this.socket) this.socket = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    if (!this.closedExplicitly && this.desired.size > 0) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(60_000, 1_000 * 2 ** this.reconnectAttempt++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(() => this.scheduleReconnect());
    }, delay);
  }

  async queryQuotes(symbols: string[]): Promise<RawQuote[]> {
    await this.connect();
    const body = await this.request(COMMAND_QUERY_SECURITY_QUOTE, encodeMultiSecurityRequest(symbols), QUERY_TIMEOUT_MS);
    return decodeSecurityQuoteResponse(body);
  }

  async queryCandlesticks(symbol: string, period: string, count: number, session: "intraday" | "all"): Promise<RawBar[]> {
    await this.connect();
    const body = await this.request(
      COMMAND_QUERY_CANDLESTICK,
      encodeCandlestickRequest(
        symbol,
        candlestickPeriod(period),
        count,
        session === "all" ? TRADE_SESSIONS_ALL : TRADE_SESSIONS_INTRADAY,
      ),
      QUERY_TIMEOUT_MS,
    );
    return decodeCandlestickResponse(body);
  }

  async queryStaticNames(symbols: string[]): Promise<Array<{ symbol: string; name: string }>> {
    await this.connect();
    const body = await this.request(COMMAND_QUERY_SECURITY_STATIC, encodeMultiSecurityRequest(symbols), QUERY_TIMEOUT_MS);
    return decodeStaticNameResponse(body);
  }

  async queryCapitalFlow(symbol: string): Promise<FlowRow[]> {
    await this.connect();
    const body = await this.request(COMMAND_QUERY_CAPITAL_FLOW, encodeMultiSecurityRequest([symbol]), QUERY_TIMEOUT_MS);
    return decodeCapitalFlowResponse(body);
  }

  async queryCapitalDistribution(symbol: string): Promise<RawCapitalDistribution> {
    await this.connect();
    const body = await this.request(
      COMMAND_QUERY_CAPITAL_DISTRIBUTION,
      encodeMultiSecurityRequest([symbol]),
      QUERY_TIMEOUT_MS,
    );
    return decodeCapitalDistributionResponse(body);
  }

  async subscribe(symbols: string[], subTypes: number[]): Promise<void> {
    const alreadyConnected = this.socket?.readyState === 1;
    for (const symbol of symbols) {
      const current = this.desired.get(symbol) ?? new Set<number>();
      for (const type of subTypes) current.add(type);
      this.desired.set(symbol, current);
    }
    await this.connect();
    if (alreadyConnected) await this.request(COMMAND_SUBSCRIBE, encodeSubscribeRequest(symbols, subTypes, true));
  }

  async unsubscribe(symbols: string[], subTypes: number[]): Promise<void> {
    for (const symbol of symbols) {
      const current = this.desired.get(symbol);
      if (!current) continue;
      for (const type of subTypes) current.delete(type);
      if (current.size === 0) this.desired.delete(symbol);
    }
    if (this.socket?.readyState === 1) {
      await this.request(COMMAND_UNSUBSCRIBE, encodeUnsubscribeRequest(symbols, subTypes));
    }
    if (this.desired.size === 0 && this.pending.size === 0) this.close();
  }

  private async restoreSubscriptions(): Promise<void> {
    const grouped = new Map<string, string[]>();
    for (const [symbol, types] of this.desired) {
      const key = [...types].sort().join(",");
      const symbols = grouped.get(key) ?? [];
      symbols.push(symbol);
      grouped.set(key, symbols);
    }
    for (const [key, symbols] of grouped) {
      const types = key.split(",").filter(Boolean).map(Number);
      await this.request(COMMAND_SUBSCRIBE, encodeSubscribeRequest(symbols, types, false));
    }
  }

  close(): void {
    this.closedExplicitly = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
  }
}
