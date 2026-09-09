// @vitest-environment jsdom
import type { ReactElement } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const COMPILED = 'return function App(){return null}';

vi.mock('@web/lib/client', () => ({
  client: {
    canvas: {
      recordCheck: vi.fn(),
      compile: vi.fn(async ({ source }: { source: string }) => {
        if (!source.includes('export default')) {
          return { ok: false, issues: ['must have exactly one export default'] };
        }
        return { ok: true, code: COMPILED };
      }),
    },
  },
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

const { client } = await import('@web/lib/client');
const { CanvasFrame } = await import('./CanvasFrame');

type LiveStatus = { subscribed: boolean; connected: boolean; degraded: boolean };

afterEach(() => {
  cleanup();
  release.mockClear();
  subscribeChannel.mockClear();
  vi.mocked(client.canvas.recordCheck).mockClear();
  vi.mocked(client.canvas.compile).mockClear();
});

async function renderReady(ui: ReactElement) {
  const view = render(ui);
  await waitFor(() => expect(view.container.querySelector('iframe')).toBeTruthy());
  return view;
}

describe('CanvasFrame', () => {
  it('loads the guest page in a script-only sandbox', async () => {
    const { container } = await renderReady(
      <CanvasFrame source="export default function App() { return null; }" />,
    );
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute('src')).toBe('/canvas-guest.html');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    expect(iframe?.getAttribute('tabindex')).toBe('-1');
  });

  it('re-posts the compiled code once the guest is ready and data changes', async () => {
    const source = 'export default function App() { return null; }';
    const { container, rerender } = await renderReady(
      <CanvasFrame source={source} data={{ bars: 1 }} />,
    );
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
    expect(posts).toEqual([{ type: 'code', code: COMPILED, data: { bars: 2 } }]);

    rerender(<CanvasFrame source={source} data={{ bars: 3 }} />);
    expect(posts).toEqual([
      { type: 'code', code: COMPILED, data: { bars: 2 } },
      { type: 'code', code: COMPILED, data: { bars: 3 } },
    ]);
  });

  it('does not mount an iframe when the source fails to compile', async () => {
    const { container } = render(
      <CanvasFrame source="export function App() { return null; }" slug="broken" />,
    );
    await waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/export default/i);
    });
    expect(container.querySelector('iframe')).toBeNull();
    expect(client.canvas.recordCheck).toHaveBeenCalledWith({
      slug: 'broken',
      issues: expect.arrayContaining([expect.stringMatching(/export default/i)]),
      stage: 'compile',
    });
  });

  it('keeps compile errors visible in the host after the guest reports them', async () => {
    const { container } = await renderReady(
      <CanvasFrame
        source="export default function App() { return null; }"
        slug="aapl-iphone-duo-launch"
      />,
    );
    const iframe = container.querySelector('iframe')!;
    const guest = iframe.contentWindow!;

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'runtime-error',
            issues: ['Cannot use import statement outside a module'],
            stage: 'compile',
          },
          source: guest,
        }),
      );
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Cannot use import statement outside a module');

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'height', height: 18 }, source: guest }),
      );
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Cannot use import statement outside a module',
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(client.canvas.recordCheck).toHaveBeenCalledWith({
      slug: 'aapl-iphone-duo-launch',
      issues: ['Cannot use import statement outside a module'],
      stage: 'compile',
    });
  });

  it('remounts the iframe when the source is replaced after an error', async () => {
    const valid = 'export default function App() { return null; }';
    const { container, rerender } = await renderReady(<CanvasFrame source={valid} slug="demo" />);
    const guest = container.querySelector('iframe')!.contentWindow!;
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'runtime-error', issues: ['boom'], stage: 'runtime' },
          source: guest,
        }),
      );
    });
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('boom');

    rerender(<CanvasFrame source={`${valid}\n`} slug="demo" />);
    await waitFor(() => expect(container.querySelector('iframe')).toBeTruthy());
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('CanvasFrame live bridge', () => {
  async function setup(onLiveStatus?: (status: LiveStatus) => void) {
    const { container } = await renderReady(
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

  it('proxies a quotes subscription and forwards only that symbol', async () => {
    const { posts, send } = await setup();
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

  it('proxies a preview subscription and forwards a candle feed', async () => {
    const { posts, send } = await setup();
    send({ type: 'sub', kind: 'preview', symbol: 'MU.US' });
    expect(subscribeChannel.mock.calls[0][0]).toEqual({ kind: 'preview', symbol: 'MU.US' });

    const tf = () => ({
      candles: [{ time: 1000, open: 1, high: 2, low: 0, close: 1 }],
      volumes: [{ time: 1000, value: 10 }],
      emas: [{ period: 20, data: [{ time: 1000, value: 1 }] }],
      macdDif: [{ time: 1000, value: 0.1 }],
      macdDea: [{ time: 1000, value: 0.2 }],
      macdHist: [{ time: 1000, value: -0.1 }],
      offSession: [{ startTime: 900, endTime: 1000, kind: 'pre' }],
      markers: [{ time: 1000, text: 'server' }],
      macdCrossMarkers: [{ time: 1000, text: 'cross' }],
      autoDivergence: [{ from: 1 }],
      chanStructure: { bi: [] },
    });
    const onPayload = subscribeChannel.mock.calls[0][1];
    act(() => {
      onPayload({
        type: 'data',
        data: {
          built: { kind: 'intraday', timeframes: { m5: tf(), m15: tf(), h1: tf() } },
        },
      });
    });
    const feed = posts.find((post) => post.type === 'feed')!;
    expect(feed.kind).toBe('preview');
    expect(feed.data.symbol).toBe('MU.US');
    expect(Object.keys(feed.data.timeframes).sort()).toEqual(['h1', 'm15', 'm5']);
    for (const key of ['m5', 'm15', 'h1']) {
      expect(Object.keys(feed.data.timeframes[key]).sort()).toEqual([
        'candles',
        'emas',
        'macdDea',
        'macdDif',
        'macdHist',
        'offSession',
        'volumes',
      ]);
    }
    expect(feed.data.timeframes.m5.candles).toEqual(tf().candles);
    expect(typeof feed.data.asOf).toBe('string');
  });

  it('ignores subscriptions past the per-canvas cap', async () => {
    const { send } = await setup();
    for (const symbol of ['A.US', 'B.US', 'C.US', 'D.US', 'E.US', 'F.US', 'G.US']) {
      send({ type: 'sub', kind: 'quotes', symbol });
    }
    expect(subscribeChannel.mock.calls.length).toBe(6);
  });

  it('goes degraded when a preview build fails before any data', async () => {
    const onLiveStatus = vi.fn();
    const { posts, send } = await setup(onLiveStatus);
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

  it('releases on unsub, on iframe reload, and on unmount', async () => {
    const { container } = await renderReady(
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

  it('reports subscription, connection and degraded state', async () => {
    const onLiveStatus = vi.fn();
    const { posts, send } = await setup(onLiveStatus);
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
