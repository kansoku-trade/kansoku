// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { loadCanvasComponent } from './canvasRuntime';

afterEach(() => {
  cleanup();
});

const valid = `import { Canvas, Text } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="Runtime demo" caption="test"><Text>hello canvas</Text></Canvas>;
}
`;

describe('loadCanvasComponent', () => {
  it('renders a compiled canvas', () => {
    const result = loadCanvasComponent(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    render(<result.Component />);
    expect(screen.getByRole('heading', { name: 'Runtime demo' })).toBeTruthy();
    expect(screen.getByText('hello canvas')).toBeTruthy();
  });

  it('returns static-check issues without throwing', () => {
    const result = loadCanvasComponent('export function App() { return null; }\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => /export default/i.test(issue))).toBe(true);
  });
});
