import type { FlowRow, RawBar } from '@kansoku/shared/types';
import {
  reportLongbridgeEndpointFailure,
  resolveLongbridgeEndpoints,
  type ResolvedLongbridgeEndpoints,
} from './longbridgeEndpoints.js';
import { readLongbridgeToken, type LongbridgeToken } from './longbridgeToken.js';
import type { RawCapitalDistribution, RawQuote } from './types.js';
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
  decodeErrorDetail,
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
} from './longbridgeProtocol.js';

const QUERY_TIMEOUT_MS = 10_000;
const OTP_TIMEOUT_MS = 8_000;
const CONNECT_TIMEOUT_MS = 10_000;
const REQUEST_WINDOW_MS = 1_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const MAX_CONCURRENT_REQUESTS = 5;
const RATE_LIMIT_BACKOFF_MS = 1_000;

interface SocketEvent {
  data?: unknown;
}

export interface WebSocketLike {
  binaryType: string;
  readyState: number;
  addEventListener(
    type: 'open' | 'message' | 'close' | 'error',
    listener: (event: SocketEvent) => void,
  ): void;
  send(data: Uint8Array): void;
  close(): void;
}

export interface LongbridgeSocketDeps {
  createSocket?: (url: string) => WebSocketLike;
  loadToken?: () => Promise<LongbridgeToken>;
  getOtp?: (token: LongbridgeToken) => Promise<string>;
  endpoint?: string;
  resolveEndpoints?: () => Promise<ResolvedLongbridgeEndpoints>;
  reportEndpointFailure?: () => void;
  connectTimeoutMs?: number;
  requestLimits?: {
    maxConcurrent?: number;
    maxPerWindow?: number;
    windowMs?: number;
    rateLimitBackoffMs?: number;
  };
}

type Pending = {
  command: number;
  resolve: (body: Uint8Array) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type QueuedRequest = {
  command: number;
  body: Uint8Array;
  timeoutMs: number;
  resolve: (body: Uint8Array) => void;
  reject: (error: Error) => void;
};

export class LongbridgeResponseError extends Error {
  constructor(
    readonly command: number,
    readonly status: number,
    readonly code: number | null,
    readonly detailMessage: string | null,
  ) {
    super(
      [
        `Longbridge response failed: command=${command} status=${status}`,
        code ? `code=${code}` : '',
        detailMessage ? `message=${detailMessage}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
    this.name = 'LongbridgeResponseError';
  }

  get rateLimited(): boolean {
    return this.code === 301606;
  }
}

export class LongbridgeProtocolError extends Error {
  constructor(label: string, cause: unknown) {
    super(
      `Longbridge ${label} response could not be decoded: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'LongbridgeProtocolError';
  }
}

export class LongbridgeNetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LongbridgeNetworkError';
  }
}

function defaultCreateSocket(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike;
}

async function fetchSocketOtp(token: LongbridgeToken, httpBase: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${httpBase.replace(/\/$/, '')}/v2/socket/token`, {
      headers: {
        'Authorization': `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      signal: AbortSignal.timeout(OTP_TIMEOUT_MS),
    });
  } catch (error) {
    throw new LongbridgeNetworkError(`Longbridge socket OTP request could not reach ${httpBase}`, {
      cause: error,
    });
  }
  if (!response.ok)
    throw new Error(`Longbridge socket OTP request failed: HTTP ${response.status}`);
  const payload = (await response.json()) as {
    code?: number;
    message?: string;
    data?: { otp?: string };
  };
  const otp = payload.data?.otp;
  if (payload.code !== 0 || !otp)
    throw new Error(`Longbridge socket OTP request failed: ${payload.message ?? 'unknown error'}`);
  return otp;
}

async function messageBytes(data: unknown): Promise<Uint8Array> {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (typeof Blob !== 'undefined' && data instanceof Blob)
    return new Uint8Array(await data.arrayBuffer());
  throw new Error('Unsupported Longbridge WebSocket message');
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
  private requestQueue: QueuedRequest[] = [];
  private activeRequests = 0;
  private recentRequestStarts: number[] = [];
  private requestQueueTimer: ReturnType<typeof setTimeout> | null = null;
  private requestBlockedUntil = 0;
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
    let endpoints: Promise<ResolvedLongbridgeEndpoints> | null = null;
    const resolveEndpoints = () =>
      (endpoints ??= (this.deps.resolveEndpoints ?? resolveLongbridgeEndpoints)());
    const requestOtp = async () =>
      this.deps.getOtp
        ? this.deps.getOtp(token)
        : fetchSocketOtp(token, (await resolveEndpoints()).http);

    const base = this.deps.endpoint ?? (await resolveEndpoints()).ws;
    const url = new URL(base);
    url.searchParams.set('version', '1');
    url.searchParams.set('codec', '1');
    url.searchParams.set('platform', '9');
    const socket = (this.deps.createSocket ?? defaultCreateSocket)(url.toString());
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    socket.addEventListener('message', (event) => void this.handleMessage(event.data));
    socket.addEventListener('close', () =>
      this.handleClose(new Error('Longbridge WebSocket closed')),
    );

    const connectTimeoutMs = this.deps.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          try {
            socket.close();
          } catch {
            /* already closed */
          }
          reject(
            new LongbridgeNetworkError(
              `Longbridge WebSocket did not open within ${connectTimeoutMs}ms`,
            ),
          );
        }, connectTimeoutMs);
        socket.addEventListener('open', () => {
          clearTimeout(timer);
          resolve();
        });
        socket.addEventListener('error', () => {
          clearTimeout(timer);
          reject(new LongbridgeNetworkError('Longbridge WebSocket connection failed'));
        });
      });

      const metadata = { need_over_night_quote: 'true' };
      let sessionBody: Uint8Array;
      let reconnect = false;
      if (this.session && this.session.deadline > Date.now()) {
        try {
          sessionBody = await this.request(
            COMMAND_RECONNECT,
            encodeReconnectRequest(this.session.id, metadata),
            5_000,
          );
          reconnect = true;
        } catch {
          const otp = await requestOtp();
          sessionBody = await this.request(COMMAND_AUTH, encodeAuthRequest(otp, metadata), 5_000);
        }
      } else {
        const otp = await requestOtp();
        sessionBody = await this.request(COMMAND_AUTH, encodeAuthRequest(otp, metadata), 5_000);
      }
      const next = decodeSessionResponse(sessionBody);
      this.session = {
        id: next.sessionId,
        deadline:
          reconnect || next.expires < 1_000_000_000_000 ? Date.now() + next.expires : next.expires,
      };
      this.reconnectAttempt = 0;
      await this.restoreSubscriptions();
    } catch (error) {
      if (error instanceof LongbridgeNetworkError)
        (this.deps.reportEndpointFailure ?? reportLongbridgeEndpointFailure)();
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
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ command, body, timeoutMs, resolve, reject });
      this.drainRequestQueue();
    });
  }

  private requestLimits(): Required<NonNullable<LongbridgeSocketDeps['requestLimits']>> {
    return {
      maxConcurrent: this.deps.requestLimits?.maxConcurrent ?? MAX_CONCURRENT_REQUESTS,
      maxPerWindow: this.deps.requestLimits?.maxPerWindow ?? MAX_REQUESTS_PER_WINDOW,
      windowMs: this.deps.requestLimits?.windowMs ?? REQUEST_WINDOW_MS,
      rateLimitBackoffMs: this.deps.requestLimits?.rateLimitBackoffMs ?? RATE_LIMIT_BACKOFF_MS,
    };
  }

  private drainRequestQueue(): void {
    if (this.requestQueueTimer) {
      clearTimeout(this.requestQueueTimer);
      this.requestQueueTimer = null;
    }
    const limits = this.requestLimits();
    const now = Date.now();
    this.recentRequestStarts = this.recentRequestStarts.filter(
      (startedAt) => now - startedAt < limits.windowMs,
    );

    while (
      this.requestQueue.length > 0 &&
      this.activeRequests < limits.maxConcurrent &&
      this.recentRequestStarts.length < limits.maxPerWindow &&
      Date.now() >= this.requestBlockedUntil
    ) {
      const queued = this.requestQueue.shift()!;
      this.dispatchRequest(queued);
    }

    if (!this.requestQueue.length || this.activeRequests >= limits.maxConcurrent) return;
    const rateDelay =
      this.recentRequestStarts.length >= limits.maxPerWindow
        ? this.recentRequestStarts[0] + limits.windowMs - Date.now()
        : 0;
    const blockedDelay = this.requestBlockedUntil - Date.now();
    const delay = Math.max(1, rateDelay, blockedDelay);
    this.requestQueueTimer = setTimeout(() => {
      this.requestQueueTimer = null;
      this.drainRequestQueue();
    }, delay);
  }

  private dispatchRequest(queued: QueuedRequest): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1) {
      queued.reject(new Error('Longbridge WebSocket is not connected'));
      queueMicrotask(() => this.drainRequestQueue());
      return;
    }
    const requestId = ++this.requestId;
    this.activeRequests += 1;
    this.recentRequestStarts.push(Date.now());
    const settle = () => {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      this.drainRequestQueue();
    };
    const resolve = (responseBody: Uint8Array) => {
      queued.resolve(responseBody);
      settle();
    };
    const reject = (error: Error) => {
      queued.reject(error);
      settle();
    };
    try {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Longbridge request timed out: ${queued.command}`));
      }, queued.timeoutMs);
      this.pending.set(requestId, { command: queued.command, resolve, reject, timer });
      socket.send(encodeRequest(queued.command, requestId, queued.timeoutMs, queued.body));
    } catch (error) {
      const pending = this.pending.get(requestId);
      if (pending) clearTimeout(pending.timer);
      this.pending.delete(requestId);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async handleMessage(data: unknown): Promise<void> {
    try {
      const packet = decodePacket(await messageBytes(data));
      if (packet.type === 'response') {
        const pending = this.pending.get(packet.requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(packet.requestId);
        if (packet.status === 0) pending.resolve(packet.body);
        else {
          const detail = decodeErrorDetail(packet.body);
          const error = new LongbridgeResponseError(
            packet.command,
            packet.status,
            detail?.code ?? null,
            detail?.message || null,
          );
          if (error.rateLimited) {
            this.requestBlockedUntil = Math.max(
              this.requestBlockedUntil,
              Date.now() + this.requestLimits().rateLimitBackoffMs,
            );
          }
          pending.reject(error);
        }
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
      console.warn(
        '[longbridge-socket] invalid message',
        error instanceof Error ? error.message : error,
      );
    }
  }

  private handleClose(error: Error): void {
    if (this.socket) this.socket = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    for (const queued of this.requestQueue.splice(0)) queued.reject(error);
    if (this.requestQueueTimer) clearTimeout(this.requestQueueTimer);
    this.requestQueueTimer = null;
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
    const body = await this.request(
      COMMAND_QUERY_SECURITY_QUOTE,
      encodeMultiSecurityRequest(symbols),
      QUERY_TIMEOUT_MS,
    );
    return this.decodeResponse('quote', body, decodeSecurityQuoteResponse);
  }

  async queryCandlesticks(
    symbol: string,
    period: string,
    count: number,
    session: 'intraday' | 'all',
  ): Promise<RawBar[]> {
    await this.connect();
    const body = await this.request(
      COMMAND_QUERY_CANDLESTICK,
      encodeCandlestickRequest(
        symbol,
        candlestickPeriod(period),
        count,
        session === 'all' ? TRADE_SESSIONS_ALL : TRADE_SESSIONS_INTRADAY,
      ),
      QUERY_TIMEOUT_MS,
    );
    return this.decodeResponse('candlestick', body, decodeCandlestickResponse);
  }

  async queryStaticNames(symbols: string[]): Promise<Array<{ symbol: string; name: string }>> {
    await this.connect();
    const body = await this.request(
      COMMAND_QUERY_SECURITY_STATIC,
      encodeMultiSecurityRequest(symbols),
      QUERY_TIMEOUT_MS,
    );
    return this.decodeResponse('static', body, decodeStaticNameResponse);
  }

  async queryCapitalFlow(symbol: string): Promise<FlowRow[]> {
    await this.connect();
    const body = await this.request(
      COMMAND_QUERY_CAPITAL_FLOW,
      encodeMultiSecurityRequest([symbol]),
      QUERY_TIMEOUT_MS,
    );
    return this.decodeResponse('capital flow', body, decodeCapitalFlowResponse);
  }

  async queryCapitalDistribution(symbol: string): Promise<RawCapitalDistribution> {
    await this.connect();
    const body = await this.request(
      COMMAND_QUERY_CAPITAL_DISTRIBUTION,
      encodeMultiSecurityRequest([symbol]),
      QUERY_TIMEOUT_MS,
    );
    return this.decodeResponse('capital distribution', body, decodeCapitalDistributionResponse);
  }

  private decodeResponse<T>(label: string, body: Uint8Array, decode: (body: Uint8Array) => T): T {
    try {
      return decode(body);
    } catch (error) {
      throw new LongbridgeProtocolError(label, error);
    }
  }

  async subscribe(symbols: string[], subTypes: number[]): Promise<void> {
    const alreadyConnected = this.socket?.readyState === 1;
    for (const symbol of symbols) {
      const current = this.desired.get(symbol) ?? new Set<number>();
      for (const type of subTypes) current.add(type);
      this.desired.set(symbol, current);
    }
    await this.connect();
    if (alreadyConnected)
      await this.request(COMMAND_SUBSCRIBE, encodeSubscribeRequest(symbols, subTypes, true));
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
      const key = [...types].sort().join(',');
      const symbols = grouped.get(key) ?? [];
      symbols.push(symbol);
      grouped.set(key, symbols);
    }
    for (const [key, symbols] of grouped) {
      const types = key.split(',').filter(Boolean).map(Number);
      await this.request(COMMAND_SUBSCRIBE, encodeSubscribeRequest(symbols, types, false));
    }
  }

  close(): void {
    this.closedExplicitly = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.requestQueueTimer) clearTimeout(this.requestQueueTimer);
    this.requestQueueTimer = null;
    const error = new Error('Longbridge WebSocket closed');
    for (const queued of this.requestQueue.splice(0)) queued.reject(error);
    this.socket?.close();
    this.socket = null;
  }
}
