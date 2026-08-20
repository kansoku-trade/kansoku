import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LongbridgeNetworkError,
  LongbridgeQuoteSocket,
  type WebSocketLike,
} from '../src/marketdata/longbridgeSocket.js';

type Listener = (event: { data?: unknown }) => void;

function str(field: number, value: string): number[] {
  const body = [...Buffer.from(value)];
  return [(field << 3) | 2, body.length, ...body];
}

function num(field: number, value: number): number[] {
  const encoded: number[] = [];
  let current = value;
  while (current >= 0x80) {
    encoded.push((current & 0x7f) | 0x80);
    current = Math.floor(current / 0x80);
  }
  encoded.push(current);
  return [field << 3, ...encoded];
}

function response(command: number, requestId: number, body: number[] = [], status = 0): Uint8Array {
  return Uint8Array.from([
    2,
    command,
    (requestId >>> 24) & 0xff,
    (requestId >>> 16) & 0xff,
    (requestId >>> 8) & 0xff,
    requestId & 0xff,
    status,
    (body.length >>> 16) & 0xff,
    (body.length >>> 8) & 0xff,
    body.length & 0xff,
    ...body,
  ]);
}

class FakeSocket implements WebSocketLike {
  binaryType = '';
  readyState = 0;
  listeners = new Map<string, Listener[]>();
  sent: Uint8Array[] = [];

  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: Listener): void {
    const items = this.listeners.get(type) ?? [];
    items.push(listener);
    this.listeners.set(type, items);
  }

  emit(type: string, event: { data?: unknown } = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  replies = new Map<number, number[]>();
  statuses = new Map<number, number>();
  failRemaining = new Map<number, number>();
  deferredCommands = new Set<number>();
  deferredRequests: Array<{ command: number; requestId: number }> = [];
  authStatus = 0;

  send(data: Uint8Array): void {
    this.sent.push(data);
    const command = data[1];
    const requestId = data[2] * 0x1000000 + (data[3] << 16) + (data[4] << 8) + data[5];
    if (command === 2 && this.authStatus !== 0) {
      queueMicrotask(() =>
        this.emit('message', { data: response(command, requestId, [], this.authStatus) }),
      );
      return;
    }
    const remaining = this.failRemaining.get(command) ?? 0;
    if (remaining > 0) {
      this.failRemaining.set(command, remaining - 1);
      queueMicrotask(() =>
        this.emit('message', {
          data: response(command, requestId, [...num(1, 301_606), ...str(2, 'Request rate limit')], 3),
        }),
      );
      return;
    }
    const body =
      command === 2 ? [...str(1, 'session'), ...num(2, 120)] : (this.replies.get(command) ?? []);
    if (this.deferredCommands.has(command)) {
      this.deferredRequests.push({ command, requestId });
      return;
    }
    queueMicrotask(() =>
      this.emit('message', {
        data: response(command, requestId, body, this.statuses.get(command) ?? 0),
      }),
    );
  }

  replyDeferred(index = 0): void {
    const request = this.deferredRequests.splice(index, 1)[0];
    if (!request) throw new Error('No deferred request');
    const body = this.replies.get(request.command) ?? [];
    this.emit('message', {
      data: response(
        request.command,
        request.requestId,
        body,
        this.statuses.get(request.command) ?? 0,
      ),
    });
  }

  close(): void {
    this.readyState = 3;
    this.emit('close');
  }
}

const loadToken = async () => ({
  clientId: 'client',
  accessToken: 'token',
  refreshToken: null,
  expiresAt: 4_102_444_800,
  dcRegion: 'us',
});

function opening(fake: FakeSocket): () => WebSocketLike {
  return () => {
    queueMicrotask(() => {
      fake.readyState = 1;
      fake.emit('open');
    });
    return fake;
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LongbridgeQuoteSocket', () => {
  it('authenticates, restores desired subscriptions, and dispatches quote pushes', async () => {
    const fake = new FakeSocket();
    const createSocket = vi.fn(() => {
      queueMicrotask(() => {
        fake.readyState = 1;
        fake.emit('open');
      });
      return fake;
    });
    const socket = new LongbridgeQuoteSocket({
      createSocket,
      loadToken: async () => ({
        clientId: 'client',
        accessToken: 'token',
        refreshToken: null,
        expiresAt: 4_102_444_800,
        dcRegion: 'us',
      }),
      getOtp: async () => 'socket-otp',
      endpoint: 'wss://example.test/v2',
    });
    const onQuote = vi.fn();
    socket.onQuote(onQuote);

    await socket.subscribe(['AAPL.US'], [1]);
    expect(createSocket).toHaveBeenCalledWith('wss://example.test/v2?version=1&codec=1&platform=9');
    expect(fake.sent.map((packet) => packet[1])).toEqual([2, 6]);

    const quote = [
      ...str(1, 'AAPL.US'),
      ...num(2, 1),
      ...str(3, '210.5'),
      ...num(7, 100),
      ...num(11, 0),
    ];
    fake.emit('message', { data: Uint8Array.from([3, 101, 0, 0, quote.length, ...quote]) });
    await Promise.resolve();
    expect(onQuote).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'AAPL.US', lastDone: 210.5 }),
    );
    socket.close();
  });

  it('serves quote and candlestick queries over the same connection', async () => {
    const fake = new FakeSocket();
    const msg = (field: number, body: number[]) => [(field << 3) | 2, body.length, ...body];
    fake.replies.set(11, msg(1, [...str(1, 'SMH.US'), ...str(2, '604'), ...str(3, '600.31')]));
    fake.replies.set(19, [
      ...str(1, 'SMH.US'),
      ...msg(2, [
        ...str(1, '10.5'),
        ...str(2, '10'),
        ...str(3, '9.5'),
        ...str(4, '11'),
        ...num(5, 42),
        ...num(7, 60),
      ]),
    ]);
    const socket = new LongbridgeQuoteSocket({
      createSocket: () => {
        queueMicrotask(() => {
          fake.readyState = 1;
          fake.emit('open');
        });
        return fake;
      },
      loadToken: async () => ({
        clientId: 'client',
        accessToken: 'token',
        refreshToken: null,
        expiresAt: 4_102_444_800,
        dcRegion: 'us',
      }),
      getOtp: async () => 'socket-otp',
      endpoint: 'wss://example.test/v2',
    });

    await expect(socket.queryQuotes(['SMH.US'])).resolves.toEqual([
      { symbol: 'SMH.US', last: '604', prev_close: '600.31', change_percentage: '0.615' },
    ]);
    await expect(socket.queryCandlesticks('SMH.US', '5m', 2, 'all')).resolves.toEqual([
      { time: '1970-01-01T00:01:00.000Z', open: 10, high: 11, low: 9.5, close: 10.5, volume: 42 },
    ]);
    expect(fake.sent.map((packet) => packet[1])).toEqual([2, 11, 19]);
    socket.close();
  });

  it('closes the socket when auth is rejected so the connection slot is freed', async () => {
    const fake = new FakeSocket();
    fake.authStatus = 5;
    const socket = new LongbridgeQuoteSocket({
      createSocket: () => {
        queueMicrotask(() => {
          fake.readyState = 1;
          fake.emit('open');
        });
        return fake;
      },
      loadToken: async () => ({
        clientId: 'client',
        accessToken: 'token',
        refreshToken: null,
        expiresAt: 4_102_444_800,
        dcRegion: 'us',
      }),
      getOtp: async () => 'socket-otp',
      endpoint: 'wss://example.test/v2',
    });

    await expect(socket.queryQuotes(['SMH.US'])).rejects.toThrow('command=2 status=5');
    expect(fake.readyState).toBe(3);
  });

  it('reports the business error code and message from a rejected response', async () => {
    const fake = new FakeSocket();
    fake.statuses.set(19, 3);
    fake.replies.set(19, [...num(1, 301_606), ...str(2, 'Request rate limit')]);
    const socket = new LongbridgeQuoteSocket({
      createSocket: () => {
        queueMicrotask(() => {
          fake.readyState = 1;
          fake.emit('open');
        });
        return fake;
      },
      loadToken: async () => ({
        clientId: 'client',
        accessToken: 'token',
        refreshToken: null,
        expiresAt: 4_102_444_800,
        dcRegion: 'us',
      }),
      getOtp: async () => 'socket-otp',
      endpoint: 'wss://example.test/v2',
      requestLimits: { maxRateLimitRetries: 0 },
    });

    await expect(socket.queryCandlesticks('SMH.US', '5m', 2, 'all')).rejects.toMatchObject({
      command: 19,
      status: 3,
      code: 301_606,
      detailMessage: 'Request rate limit',
      rateLimited: true,
    });
    socket.close();
  });

  it('retries a rate-limited request instead of failing the caller', async () => {
    vi.useFakeTimers();
    try {
      const fake = new FakeSocket();
      fake.failRemaining.set(19, 1);
      const socket = new LongbridgeQuoteSocket({
        createSocket: opening(fake),
        loadToken,
        getOtp: async () => 'socket-otp',
        endpoint: 'wss://example.test/v2',
      });
      const pending = socket.queryCandlesticks('SMH.US', '5m', 2, 'all');
      await vi.advanceTimersByTimeAsync(0);
      expect(fake.sent.filter((packet) => packet[1] === 19)).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(pending).resolves.toEqual([]);
      expect(fake.sent.filter((packet) => packet[1] === 19)).toHaveLength(2);
      socket.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('spaces candlestick queries for the same symbol so the second waits out the per-symbol window', async () => {
    vi.useFakeTimers();
    try {
      const fake = new FakeSocket();
      fake.deferredCommands.add(19);
      const socket = new LongbridgeQuoteSocket({
        createSocket: opening(fake),
        loadToken,
        getOtp: async () => 'socket-otp',
        endpoint: 'wss://example.test/v2',
        requestLimits: { maxConcurrent: 5, maxPerWindow: 10, symbolGapMs: 200 },
      });
      await socket.connect();
      const first = socket.queryCandlesticks('NVDA.US', '5m', 2, 'all');
      const second = socket.queryCandlesticks('NVDA.US', '15m', 2, 'all');
      await vi.advanceTimersByTimeAsync(0);
      expect(fake.sent.filter((packet) => packet[1] === 19)).toHaveLength(1);
      fake.replyDeferred();
      await vi.advanceTimersByTimeAsync(0);
      expect(fake.sent.filter((packet) => packet[1] === 19)).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(200);
      expect(fake.sent.filter((packet) => packet[1] === 19)).toHaveLength(2);
      fake.replyDeferred();
      await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
      socket.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('queues requests above the concurrent request ceiling', async () => {
    const fake = new FakeSocket();
    fake.deferredCommands.add(11);
    const socket = new LongbridgeQuoteSocket({
      createSocket: () => {
        queueMicrotask(() => {
          fake.readyState = 1;
          fake.emit('open');
        });
        return fake;
      },
      loadToken: async () => ({
        clientId: 'client',
        accessToken: 'token',
        refreshToken: null,
        expiresAt: 4_102_444_800,
        dcRegion: 'us',
      }),
      getOtp: async () => 'socket-otp',
      endpoint: 'wss://example.test/v2',
      requestLimits: { maxConcurrent: 2, maxPerWindow: 100 },
    });

    const requests = [
      socket.queryQuotes(['A.US']),
      socket.queryQuotes(['B.US']),
      socket.queryQuotes(['C.US']),
    ];
    await vi.waitFor(() => expect(fake.deferredRequests).toHaveLength(2));
    fake.replyDeferred();
    await vi.waitFor(() => expect(fake.deferredRequests).toHaveLength(2));
    fake.replyDeferred();
    fake.replyDeferred();
    await expect(Promise.all(requests)).resolves.toEqual([[], [], []]);
    socket.close();
  });

  it('holds requests until the rolling rate window has capacity', async () => {
    vi.useFakeTimers();
    try {
      const fake = new FakeSocket();
      const socket = new LongbridgeQuoteSocket({
        createSocket: () => {
          queueMicrotask(() => {
            fake.readyState = 1;
            fake.emit('open');
          });
          return fake;
        },
        loadToken: async () => ({
          clientId: 'client',
          accessToken: 'token',
          refreshToken: null,
          expiresAt: 4_102_444_800,
          dcRegion: 'us',
        }),
        getOtp: async () => 'socket-otp',
        endpoint: 'wss://example.test/v2',
        requestLimits: { maxConcurrent: 5, maxPerWindow: 3, windowMs: 1_000 },
      });
      await socket.connect();

      const requests = [
        socket.queryQuotes(['A.US']),
        socket.queryQuotes(['B.US']),
        socket.queryQuotes(['C.US']),
      ];
      await vi.advanceTimersByTimeAsync(0);
      expect(fake.sent.filter((packet) => packet[1] === 11)).toHaveLength(2);

      await vi.advanceTimersByTimeAsync(1_000);
      await expect(Promise.all(requests)).resolves.toEqual([[], [], []]);
      expect(fake.sent.filter((packet) => packet[1] === 11)).toHaveLength(3);
      socket.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes and reports the endpoint when the socket never opens', async () => {
    const fake = new FakeSocket();
    const close = vi.spyOn(fake, 'close');
    const reportEndpointFailure = vi.fn();
    const socket = new LongbridgeQuoteSocket({
      createSocket: () => fake,
      loadToken,
      getOtp: async () => 'socket-otp',
      endpoint: 'wss://example.test/v2',
      reportEndpointFailure,
      connectTimeoutMs: 20,
    });

    await expect(socket.connect()).rejects.toThrow(LongbridgeNetworkError);
    expect(close).toHaveBeenCalled();
    expect(reportEndpointFailure).toHaveBeenCalledTimes(1);
  });

  it('reports the endpoint when the socket errors before opening', async () => {
    const fake = new FakeSocket();
    const reportEndpointFailure = vi.fn();
    const socket = new LongbridgeQuoteSocket({
      createSocket: () => {
        queueMicrotask(() => fake.emit('error'));
        return fake;
      },
      loadToken,
      getOtp: async () => 'socket-otp',
      endpoint: 'wss://example.test/v2',
      reportEndpointFailure,
    });

    await expect(socket.connect()).rejects.toThrow('Longbridge WebSocket connection failed');
    expect(reportEndpointFailure).toHaveBeenCalledTimes(1);
  });

  it('reports the endpoint when the OTP request cannot reach the host', async () => {
    const fake = new FakeSocket();
    const reportEndpointFailure = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const socket = new LongbridgeQuoteSocket({
      createSocket: opening(fake),
      loadToken,
      endpoint: 'wss://example.test/v2',
      resolveEndpoints: async () => ({
        http: 'https://http.example.test',
        ws: 'wss://ws.example.test/v2',
        region: null,
      }),
      reportEndpointFailure,
    });

    await expect(socket.connect()).rejects.toThrow(LongbridgeNetworkError);
    expect(reportEndpointFailure).toHaveBeenCalledTimes(1);
  });

  it('reports the endpoint when an injected OTP loader raises a network failure', async () => {
    const fake = new FakeSocket();
    const reportEndpointFailure = vi.fn();
    const socket = new LongbridgeQuoteSocket({
      createSocket: opening(fake),
      loadToken,
      getOtp: async () => {
        throw new LongbridgeNetworkError('otp host unreachable');
      },
      endpoint: 'wss://example.test/v2',
      reportEndpointFailure,
    });

    await expect(socket.connect()).rejects.toThrow('otp host unreachable');
    expect(reportEndpointFailure).toHaveBeenCalledTimes(1);
  });

  it('does not report the endpoint when the OTP request answers HTTP 401', async () => {
    const fake = new FakeSocket();
    const reportEndpointFailure = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 401 })));
    const socket = new LongbridgeQuoteSocket({
      createSocket: opening(fake),
      loadToken,
      endpoint: 'wss://example.test/v2',
      resolveEndpoints: async () => ({
        http: 'https://http.example.test',
        ws: 'wss://ws.example.test/v2',
        region: null,
      }),
      reportEndpointFailure,
    });

    await expect(socket.connect()).rejects.toThrow('HTTP 401');
    expect(reportEndpointFailure).not.toHaveBeenCalled();
  });

  it('does not report the endpoint when authentication fails after the socket opened', async () => {
    const fake = new FakeSocket();
    fake.authStatus = 5;
    const reportEndpointFailure = vi.fn();
    const socket = new LongbridgeQuoteSocket({
      createSocket: opening(fake),
      loadToken,
      getOtp: async () => 'socket-otp',
      endpoint: 'wss://example.test/v2',
      reportEndpointFailure,
    });

    await expect(socket.connect()).rejects.toThrow('command=2 status=5');
    expect(reportEndpointFailure).not.toHaveBeenCalled();
  });

  it('takes both the ws url and the OTP host from a single endpoint resolution', async () => {
    const fake = new FakeSocket();
    const createSocket = vi.fn(opening(fake));
    const otpUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        otpUrls.push(url);
        return new Response(JSON.stringify({ code: 0, data: { otp: 'socket-otp' } }));
      }),
    );
    const resolveEndpoints = vi.fn(async () => ({
      http: 'https://http.example.test',
      ws: 'wss://resolved.example.test/v2',
      region: null,
    }));
    const socket = new LongbridgeQuoteSocket({ createSocket, loadToken, resolveEndpoints });

    await socket.connect();

    expect(createSocket).toHaveBeenCalledWith(
      'wss://resolved.example.test/v2?version=1&codec=1&platform=9',
    );
    expect(otpUrls).toEqual(['https://http.example.test/v2/socket/token']);
    expect(resolveEndpoints).toHaveBeenCalledTimes(1);
    socket.close();
  });

  it('never resolves endpoints when the ws url and the OTP loader are both injected', async () => {
    const fake = new FakeSocket();
    const resolveEndpoints = vi.fn(async () => ({
      http: 'https://unused.example.test',
      ws: 'wss://unused.example.test/v2',
      region: null,
    }));
    const socket = new LongbridgeQuoteSocket({
      createSocket: opening(fake),
      loadToken,
      getOtp: async () => 'socket-otp',
      endpoint: 'wss://example.test/v2',
      resolveEndpoints,
    });

    await socket.connect();

    expect(resolveEndpoints).not.toHaveBeenCalled();
    socket.close();
  });
});
