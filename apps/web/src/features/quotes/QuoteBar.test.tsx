// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChannelSpec } from '@web/lib/ws/wsHub';

const subscribeChannel = vi.fn();

vi.mock('@web/lib/ws/wsHub', () => ({
  subscribeChannel: (...args: unknown[]) => subscribeChannel(...args),
}));

const { TopbarQuote } = await import('./QuoteBar');

describe('TopbarQuote', () => {
  let subs: { spec: ChannelSpec; onPayload: (payload: unknown) => void }[];

  beforeEach(() => {
    subs = [];
    subscribeChannel.mockReset();
    subscribeChannel.mockImplementation(
      (spec: ChannelSpec, onPayload: (payload: unknown) => void) => {
        subs.push({ spec, onPayload });
        return vi.fn();
      },
    );
  });

  afterEach(() => cleanup());

  it('subscribes to its own symbol and renders the pushed quote', () => {
    const { container } = render(<TopbarQuote sym="NVDA.US" />);
    expect(container.firstChild).toBeNull();
    expect(subs[0].spec).toEqual({ kind: 'quotes', extra: ['NVDA.US'] });

    act(() => {
      subs[0].onPayload({
        type: 'data',
        data: {
          quotes: [{ symbol: 'NVDA.US', last: 123.45, pct: 1.2, session: '日盘', asOf: '' }],
        },
      });
    });

    expect(screen.getByText('$123.45')).toBeTruthy();
    expect(screen.getByText('+1.20%')).toBeTruthy();
  });
});
