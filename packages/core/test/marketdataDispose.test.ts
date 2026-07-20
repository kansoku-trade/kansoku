import { afterEach, describe, expect, it, vi } from 'vitest';
import { disposeMarketData, getStream } from '../src/marketdata/registry.js';
import { getLongbridgeStream } from '../src/marketdata/longbridgeStream.js';
import { getSharedQuoteSocket } from '../src/marketdata/sharedSocket.js';
import { LongbridgeQuoteSocket } from '../src/marketdata/longbridgeSocket.js';

afterEach(() => {
  disposeMarketData();
  vi.restoreAllMocks();
});

describe('disposeMarketData', () => {
  it('closes the shared socket and resets the singletons', () => {
    const close = vi.spyOn(LongbridgeQuoteSocket.prototype, 'close');
    const socket = getSharedQuoteSocket();
    const stream = getLongbridgeStream();

    disposeMarketData();

    expect(close).toHaveBeenCalledTimes(1);
    expect(getSharedQuoteSocket()).not.toBe(socket);
    expect(getLongbridgeStream()).not.toBe(stream);
  });

  it('lets getStream lazily recreate a stream after disposal', () => {
    const first = getStream('US');
    disposeMarketData();
    const second = getStream('US');
    expect(second).not.toBe(first);
  });

  it('is idempotent and a no-op when nothing was created', () => {
    const close = vi.spyOn(LongbridgeQuoteSocket.prototype, 'close');
    disposeMarketData();
    expect(close).not.toHaveBeenCalled();

    getSharedQuoteSocket();
    disposeMarketData();
    disposeMarketData();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
