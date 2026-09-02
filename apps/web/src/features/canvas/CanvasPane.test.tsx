// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface LiveStatus {
  subscribed: boolean;
  connected: boolean;
  degraded: boolean;
}

let emitLiveStatus: ((status: LiveStatus) => void) | undefined;

const get = vi.fn().mockResolvedValue({
  slug: 'acceptance-mu-panel',
  title: 'MU 验收面板',
  source: 'export default function App() { return null }',
  mtime: '2026-08-28T00:00:00.000Z',
  check: null,
});

vi.mock('@web/lib/client', () => ({
  client: {
    canvas: {
      get: (...args: unknown[]) => get(...args),
    },
  },
}));
vi.mock('./CanvasFrame', () => ({
  CanvasFrame: (props: { onLiveStatus?: (status: LiveStatus) => void }) => {
    emitLiveStatus = props.onLiveStatus;
    return <div data-testid="canvas-frame" />;
  },
}));

const { CanvasPane } = await import('./CanvasPane');

afterEach(() => {
  cleanup();
  get.mockClear();
});

describe('CanvasPane chrome', () => {
  it('shows the canvas with a close button and no source switch', async () => {
    render(<CanvasPane slug="acceptance-mu-panel" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('MU 验收面板')).toBeTruthy());
    expect(screen.getByRole('button', { name: '关闭' }).textContent).not.toContain('关闭');
    expect(screen.getByText('acceptance-mu-panel')).toBeTruthy();
    expect(screen.getByTestId('canvas-frame')).toBeTruthy();
    expect(screen.queryByRole('group', { name: '画布视图' })).toBeNull();
    expect(screen.queryByRole('button', { name: '源码' })).toBeNull();
    expect(screen.queryByRole('button', { name: '画面' })).toBeNull();
  });

  it('reloads the same canvas when its file changes', async () => {
    const { rerender } = render(
      <CanvasPane slug="acceptance-mu-panel" onClose={() => {}} reloadKey="v1" />,
    );
    await screen.findByText('MU 验收面板');

    rerender(<CanvasPane slug="acceptance-mu-panel" onClose={() => {}} reloadKey="v2" />);

    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});

describe('CanvasPane live dot', () => {
  async function open() {
    render(<CanvasPane slug="acceptance-mu-panel" onClose={() => {}} />);
    await screen.findByTestId('canvas-frame');
  }

  it('shows nothing until the canvas subscribes', async () => {
    await open();
    expect(screen.queryByTestId('canvas-live-dot')).toBeNull();
  });

  it('turns live once subscribed and connected', async () => {
    await open();
    act(() => emitLiveStatus!({ subscribed: true, connected: true, degraded: false }));
    expect(screen.getByTestId('canvas-live-dot').dataset.state).toBe('live');
  });

  it('goes idle when disconnected or degraded', async () => {
    await open();
    act(() => emitLiveStatus!({ subscribed: true, connected: false, degraded: false }));
    expect(screen.getByTestId('canvas-live-dot').dataset.state).toBe('idle');
    act(() => emitLiveStatus!({ subscribed: true, connected: true, degraded: true }));
    expect(screen.getByTestId('canvas-live-dot').dataset.state).toBe('idle');
    act(() => emitLiveStatus!({ subscribed: false, connected: true, degraded: false }));
    expect(screen.queryByTestId('canvas-live-dot')).toBeNull();
  });
});
