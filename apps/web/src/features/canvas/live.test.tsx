// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCandles, useQuote } from '@kansoku/canvas';

const posts: unknown[] = [];

beforeEach(() => {
  posts.length = 0;
  vi.spyOn(window.parent, 'postMessage').mockImplementation((message: unknown) => {
    posts.push(message);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function feed(kind: string, symbol: string, data: unknown) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'feed', kind, symbol, data } }),
    );
  });
}

function QuoteProbe({ symbol }: { symbol: string }) {
  const quote = useQuote(symbol);
  return <span data-testid="quote">{quote ? `${quote.symbol}@${quote.last}` : 'none'}</span>;
}

function CandleProbe({ symbol }: { symbol: string }) {
  const feedValue = useCandles(symbol);
  return <span data-testid="candles">{feedValue ? feedValue.asOf : 'none'}</span>;
}

describe('canvas live hooks', () => {
  it('subscribes once per symbol and unsubscribes when the last consumer leaves', () => {
    const view = render(
      <>
        <QuoteProbe symbol="mu" />
        <QuoteProbe symbol="MU.US" />
      </>,
    );
    expect(posts).toEqual([{ type: 'sub', kind: 'quotes', symbol: 'MU.US' }]);

    view.rerender(<QuoteProbe symbol="MU.US" />);
    expect(posts).toEqual([{ type: 'sub', kind: 'quotes', symbol: 'MU.US' }]);

    view.unmount();
    expect(posts).toEqual([
      { type: 'sub', kind: 'quotes', symbol: 'MU.US' },
      { type: 'unsub', kind: 'quotes', symbol: 'MU.US' },
    ]);
  });

  it('ignores an invalid symbol', () => {
    render(<QuoteProbe symbol="not a symbol" />);
    expect(posts).toEqual([]);
    expect(screen.getByTestId('quote').textContent).toBe('none');
  });

  it('returns the quote cell pushed for that symbol', () => {
    render(<QuoteProbe symbol="MU" />);
    expect(screen.getByTestId('quote').textContent).toBe('none');

    feed('quotes', 'MU.US', { symbol: 'MU.US', session: 'regular', last: 61.2 });
    expect(screen.getByTestId('quote').textContent).toBe('MU.US@61.2');

    feed('quotes', 'NVDA.US', { symbol: 'NVDA.US', session: 'regular', last: 900 });
    expect(screen.getByTestId('quote').textContent).toBe('MU.US@61.2');
  });

  it('keeps quotes and candles on separate channels', () => {
    render(
      <>
        <QuoteProbe symbol="MU" />
        <CandleProbe symbol="MU" />
      </>,
    );
    expect(posts).toEqual([
      { type: 'sub', kind: 'quotes', symbol: 'MU.US' },
      { type: 'sub', kind: 'preview', symbol: 'MU.US' },
    ]);

    feed('preview', 'MU.US', { symbol: 'MU.US', asOf: '2026-09-02T13:00:00.000Z', timeframes: {} });
    expect(screen.getByTestId('candles').textContent).toBe('2026-09-02T13:00:00.000Z');
    expect(screen.getByTestId('quote').textContent).toBe('none');
  });
});
