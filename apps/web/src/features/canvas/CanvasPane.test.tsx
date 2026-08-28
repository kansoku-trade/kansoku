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
  it('uses the research segmented control and the shared Button', async () => {
    render(
      <CanvasPane
        slug="acceptance-mu-panel"
        view="canvas"
        onClose={() => {}}
        onViewChange={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByText('MU 验收面板')).toBeTruthy());
    const switchRoot = screen.getByRole('group', { name: '画布视图' });
    expect(switchRoot.className).toContain('research-view-switch');
    expect(screen.getByRole('button', { name: '关闭' }).className).toContain('btn');
  });
});
