// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@web/lib/client', () => ({
  client: {
    canvas: {
      get: vi.fn().mockResolvedValue({
        slug: 'acceptance-mu-panel',
        title: 'MU 验收面板',
        source: 'export default function App() { return null }',
        mtime: '2026-08-28T00:00:00.000Z',
        check: null,
      }),
    },
  },
}));
vi.mock('./CanvasFrame', () => ({
  CanvasFrame: () => <div data-testid="canvas-frame" />,
}));

const { CanvasPane } = await import('./CanvasPane');

afterEach(() => cleanup());

describe('CanvasPane chrome', () => {
  it('shows the canvas with a close button and no source switch', async () => {
    render(<CanvasPane slug="acceptance-mu-panel" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('MU 验收面板')).toBeTruthy());
    expect(screen.getByRole('button', { name: '关闭' }).className).toContain('btn');
    expect(screen.getByTestId('canvas-frame')).toBeTruthy();
    expect(screen.queryByRole('group', { name: '画布视图' })).toBeNull();
    expect(screen.queryByRole('button', { name: '源码' })).toBeNull();
    expect(screen.queryByRole('button', { name: '画面' })).toBeNull();
  });
});
