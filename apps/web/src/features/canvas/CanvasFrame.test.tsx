// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@web/lib/client', () => ({
  client: { canvas: { recordCheck: vi.fn() } },
}));

const release = vi.fn();
const subscribeChannel = vi.fn(
  (
    _spec: unknown,
    _onPayload: (payload: unknown) => void,
    _onConnected: (connected: boolean) => void,
  ): (() => void) => release,
);
vi.mock('@web/lib/ws/wsHub', () => ({ subscribeChannel }));

const { CanvasFrame } = await import('./CanvasFrame');

type LiveStatus = { subscribed: boolean; connected: boolean; degraded: boolean };

afterEach(() => {
  cleanup();
  release.mockClear();
  subscribeChannel.mockClear();
});

describe('CanvasFrame', () => {
  it('loads the guest page in a script-only sandbox', () => {
    const { container } = render(
      <CanvasFrame source="export default function App() { return null; }" />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute('src')).toBe('/canvas-guest.html');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    expect(iframe?.getAttribute('tabindex')).toBe('-1');
  });

  it('re-posts the source once the guest is ready and data changes', () => {
    const source = 'export default function App() { return null; }';
    const { container, rerender } = render(<CanvasFrame source={source} data={{ bars: 1 }} />);
    const iframe = container.querySelector('iframe')!;
    const posts: unknown[] = [];
    const guest = iframe.contentWindow!;
    vi.spyOn(guest, 'postMessage').mockImplementation((message: unknown) => {
      posts.push(message);
    });

    rerender(<CanvasFrame source={source} data={{ bars: 2 }} />);
    expect(posts).toEqual([]);

    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'ready' }, source: guest }));
    });
    expect(posts).toEqual([{ type: 'source', source, data: { bars: 2 } }]);

    rerender(<CanvasFrame source={source} data={{ bars: 3 }} />);
    expect(posts).toEqual([
      { type: 'source', source, data: { bars: 2 } },
      { type: 'source', source, data: { bars: 3 } },
    ]);
  });
});

describe('CanvasFrame live bridge', () => {
  function setup(onLiveStatus?: (status: LiveStatus) => void) {
    const { container } = render(
      <CanvasFrame
        source="export default function App() { return null; }"
        onLiveStatus={onLiveStatus}
      />,
    );
    const iframe = container.querySelector('iframe')!;
    const guest = iframe.contentWindow!;
    const posts: Record<string, any>[] = [];
    vi.spyOn(guest, 'postMessage').mockImplementation((message: unknown) => {
      posts.push(message as Record<string, any>);
    });
    const send = (message: unknown) => {
      act(() => {
        window.dispatchEvent(new MessageEvent('message', { data: message, source: guest }));
      });
    };
    return { iframe, posts, send };
  }

  it('proxies a quotes subscription and forwards only that symbol', () => {
    const { posts, send } = setup();
    send({ type: 'sub', kind: 'quotes', symbol: 'MU.US' });

    expect(subscribeChannel).toHaveBeenCalledTimes(1);
    expect(subscribeChannel.mock.calls[0][0]).toEqual({ kind: 'quotes', extra: ['MU.US'] });

    send({ type: 'sub', kind: 'quotes', symbol: 'MU.US' });
    expect(subscribeChannel).toHaveBeenCalledTimes(1);

    const onPayload = subscribeChannel.mock.calls[0][1];
    act(() => {
      onPayload({
        type: 'data',
        data: {
          ts: 1,
          quotes: [
            { symbol: 'NVDA.US', session: 'regular', last: 900 },
            { symbol: 'MU.US', session: 'regular', last: 61.2 },
          ],
        },
      });
    });
    expect(posts).toContainEqual({
      type: 'feed',
      kind: 'quotes',
      symbol: 'MU.US',
      data: { symbol: 'MU.US', session: 'regular', last: 61.2 },
    });
  });

  it('proxies a preview subscription and forwards a candle feed', () => {
    const { posts, send } = setup();
    send({ type: 'sub', kind: 'preview', symbol: 'MU.US' });
    expect(subscribeChannel.mock.calls[0][0]).toEqual({ kind: 'preview', symbol: 'MU.US' });

    const onPayload = subscribeChannel.mock.calls[0][1];
    act(() => {
      onPayload({
        type: 'data',
        data: { built: { kind: 'intraday', timeframes: { m5: { candles: [] } } } },
      });
    });
    const feed = posts.find((post) => post.type === 'feed')!;
    expect(feed.kind).toBe('preview');
    expect(feed.data.symbol).toBe('MU.US');
    expect(feed.data.timeframes).toEqual({ m5: { candles: [] } });
    expect(typeof feed.data.asOf).toBe('string');
  });

  it('goes degraded when a preview build fails before any data', () => {
    const onLiveStatus = vi.fn();
    const { posts, send } = setup(onLiveStatus);
    send({ type: 'sub', kind: 'preview', symbol: 'MU.US' });

    const onPayload = subscribeChannel.mock.calls[0][1];
    act(() => onPayload({ type: 'status', error: 'boom' }));

    expect(onLiveStatus).toHaveBeenLastCalledWith({
      subscribed: true,
      connected: false,
      degraded: true,
    });
    expect(posts).toContainEqual({ type: 'feed-status', connected: false, degraded: true });
  });

  it('releases on unsub, on iframe reload, and on unmount', () => {
    const { container } = render(
      <CanvasFrame source="export default function App() { return null; }" />,
    );
    const iframe = container.querySelector('iframe')!;
    const guest = iframe.contentWindow!;
    vi.spyOn(guest, 'postMessage').mockImplementation(() => {});
    const send = (message: unknown) => {
      act(() => {
        window.dispatchEvent(new MessageEvent('message', { data: message, source: guest }));
      });
    };

    send({ type: 'sub', kind: 'quotes', symbol: 'MU.US' });
    send({ type: 'unsub', kind: 'quotes', symbol: 'MU.US' });
    expect(release).toHaveBeenCalledTimes(1);

    send({ type: 'sub', kind: 'quotes', symbol: 'MU.US' });
    expect(subscribeChannel).toHaveBeenCalledTimes(2);
    act(() => {
      iframe.dispatchEvent(new Event('load'));
    });
    expect(release).toHaveBeenCalledTimes(2);

    send({ type: 'sub', kind: 'quotes', symbol: 'MU.US' });
    cleanup();
    expect(release).toHaveBeenCalledTimes(3);
  });

  it('reports subscription, connection and degraded state', () => {
    const onLiveStatus = vi.fn();
    const { posts, send } = setup(onLiveStatus);
    expect(onLiveStatus).not.toHaveBeenCalled();

    send({ type: 'sub', kind: 'quotes', symbol: 'MU.US' });
    expect(onLiveStatus).toHaveBeenLastCalledWith({
      subscribed: true,
      connected: false,
      degraded: false,
    });

    const onConnected = subscribeChannel.mock.calls[0][2];
    act(() => onConnected(true));
    expect(onLiveStatus).toHaveBeenLastCalledWith({
      subscribed: true,
      connected: true,
      degraded: false,
    });
    expect(posts).toContainEqual({ type: 'feed-status', connected: true, degraded: false });

    const onPayload = subscribeChannel.mock.calls[0][1];
    act(() => onPayload({ type: 'status', degraded: true }));
    expect(onLiveStatus).toHaveBeenLastCalledWith({
      subscribed: true,
      connected: true,
      degraded: true,
    });

    send({ type: 'unsub', kind: 'quotes', symbol: 'MU.US' });
    expect(onLiveStatus).toHaveBeenLastCalledWith({
      subscribed: false,
      connected: true,
      degraded: true,
    });
  });
});
