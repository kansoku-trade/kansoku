import { describe, expect, it } from 'vitest';
import type { ProtocolQuote } from '../src/marketdata/longbridgeProtocol.js';
import { LongbridgeStream } from '../src/marketdata/longbridgeStream.js';
import type { LongbridgeQuoteSocket } from '../src/marketdata/longbridgeSocket.js';

describe('LongbridgeStream quote timestamps', () => {
  it('advances the quote as-of time with each broker push', () => {
    let emitQuote: (quote: ProtocolQuote) => void = (_quote) => {
      throw new Error('quote listener was not registered');
    };
    const socket = {
      onQuote(listener: (quote: ProtocolQuote) => void) {
        emitQuote = listener;
        return () => {};
      },
      onTrade() {
        return () => {};
      },
    } as unknown as LongbridgeQuoteSocket;
    const stream = new LongbridgeStream({ socket });

    const push = (timestamp: number, lastDone: number) =>
      emitQuote({
        symbol: 'NOW.US',
        sequence: timestamp,
        lastDone,
        timestamp,
        volume: 1,
        currentVolume: 1,
        turnover: lastDone,
        currentTurnover: lastDone,
        tradeSession: 0,
        tag: 0,
      });

    push(1_784_000_000, 111.2);
    expect(stream.getSnapshot('NOW.US')).toMatchObject({
      last: 111.2,
      asOf: new Date(1_784_000_000_000).toISOString(),
    });

    push(1_784_000_007, 111.35);
    expect(stream.getSnapshot('NOW.US')).toMatchObject({
      last: 111.35,
      asOf: new Date(1_784_000_007_000).toISOString(),
    });
  });
});
