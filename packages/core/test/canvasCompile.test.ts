import { describe, expect, it } from 'vitest';
import { compileCanvasSource, instantiateCanvas } from '../src/canvas/compile.js';

const React = {
  createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) {
    return { type, props: { ...(props ?? {}), children: children.length <= 1 ? children[0] : children } };
  },
};

const valid = `import { Canvas, Text } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="Demo"><Text>ok</Text></Canvas>;
}
`;

describe('compileCanvasSource', () => {
  it('compiles a valid canvas and rewrites the SDK import', () => {
    const result = compileCanvasSource(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain('__kansoku_canvas__');
    expect(result.code).not.toContain("'@kansoku/canvas'");
    expect(result.code).toMatch(/createElement|jsx/);
  });

  it('produces a factory the host can run with new Function', () => {
    const result = compileCanvasSource(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sdk = {
      Canvas: ({ title, children }: { title: string; children?: unknown }) =>
        React.createElement('section', { 'data-title': title }, children),
      Text: ({ children }: { children?: unknown }) => React.createElement('span', null, children),
    };
    const Component = instantiateCanvas(result.code, sdk, React);
    expect(typeof Component).toBe('function');
    const tree = (Component as (props: object) => { type: unknown; props: { title?: string } })({});
    expect(tree.type).toBe(sdk.Canvas);
    expect(tree.props.title).toBe('Demo');
  });

  it('does not compile a source that fails the static check', () => {
    const result = compileCanvasSource('export function App() { return null; }\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => /export default/i.test(issue))).toBe(true);
  });
});
