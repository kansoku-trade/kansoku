import { describe, expect, it, vi } from 'vitest';
import {
  LongbridgeQuoteSocket,
  type WebSocketLike,
} from '../src/marketdata/longbridgeSocket.js';

type Listener = (event: { data?: unknown }) => void;

function str(field: number, value: string): number[] {
  const body = [...Buffer.from(value)];
  return [(field << 3) | 2, body.length, ...body];
}

function num(field: number, value: number): number[] {
  return [field << 3, value];
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
    const body =
      command === 2 ? [...str(1, 'session'), ...num(2, 120)] : (this.replies.get(command) ?? []);
    queueMicrotask(() => this.emit('message', { data: response(command, requestId, body) }));
  }

  close(): void {
    this.readyState = 3;
    this.emit('close');
  }
}

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
});
