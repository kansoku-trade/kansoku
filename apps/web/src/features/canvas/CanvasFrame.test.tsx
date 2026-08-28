// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@web/lib/client', () => ({
  client: { canvas: { recordCheck: vi.fn() } },
}));

const { CanvasFrame } = await import('./CanvasFrame');

afterEach(() => {
  cleanup();
});

describe('CanvasFrame', () => {
  it('loads the guest page in a script-only sandbox', () => {
    const { container } = render(<CanvasFrame source="export default function App() { return null; }" />);
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute('src')).toBe('/canvas-guest.html');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
  });
});
