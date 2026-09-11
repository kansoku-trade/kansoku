import { describe, expect, it } from 'vitest';
import { compileCanvasSource } from '../src/canvas/compile.js';
import { instantiateCanvas } from '../src/canvas/instantiate.js';

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
  it('compiles a valid canvas and rewrites the SDK import', async () => {
    const result = await compileCanvasSource(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain('__kansoku_canvas__');
    expect(result.code).not.toContain("'@kansoku/canvas'");
    expect(result.code).toMatch(/createElement|jsx/);
  });

  it('produces a factory the host can run with new Function', async () => {
    const result = await compileCanvasSource(valid);
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

  it('wraps a default-exported element so the host still gets a component', async () => {
    const result = await compileCanvasSource(`import { Canvas, Text } from '@kansoku/canvas';
export default (
  <Canvas title="Element default"><Text>ok</Text></Canvas>
);
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sdk = {
      Canvas: ({ title, children }: { title: string; children?: unknown }) =>
        React.createElement('section', { 'data-title': title }, children),
      Text: ({ children }: { children?: unknown }) => React.createElement('span', null, children),
    };
    const Component = instantiateCanvas(result.code, sdk, React);
    expect(typeof Component).toBe('function');
    const tree = (Component as () => { type: unknown; props: { title?: string } })();
    expect(tree.type).toBe(sdk.Canvas);
    expect(tree.props.title).toBe('Element default');
  });

  it('rewrites every SDK import, not just the first', async () => {
    const result = await compileCanvasSource(`import { Canvas, Text } from '@kansoku/canvas';
import { useQuote } from '@kansoku/canvas';
export default function App() {
  const q = useQuote('AAPL.US');
  return <Canvas title="Demo"><Text>{q?.last}</Text></Canvas>;
}
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).not.toMatch(/\bimport\s+/);
    const sdk = {
      Canvas: ({ title, children }: { title: string; children?: unknown }) =>
        React.createElement('section', { 'data-title': title }, children),
      Text: ({ children }: { children?: unknown }) => React.createElement('span', null, children),
      useQuote: () => ({ last: 312.47 }),
    };
    expect(() => instantiateCanvas(result.code, sdk, React)).not.toThrow();
    const Component = instantiateCanvas(result.code, sdk, React);
    expect(typeof Component).toBe('function');
  });

  it('does not compile a source that fails the static check', async () => {
    const result = await compileCanvasSource('export function App() { return null; }\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => /export default/i.test(issue))).toBe(true);
  });

  it('rewrites a json data import to read from the injected data object', async () => {
    const result = await compileCanvasSource(`import { Canvas, Text } from '@kansoku/canvas';
import bars from './bars.json';
export default function App() {
  return <Canvas title="Demo"><Text>{bars.length}</Text></Canvas>;
}
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain('__kansoku_canvas_data__["bars"]');
    expect(result.code).not.toContain("from './bars.json'");
  });

  it('makes the injected data object available at runtime', async () => {
    const result = await compileCanvasSource(`import { Canvas, Text } from '@kansoku/canvas';
import bars from './bars.json';
export default function App() {
  return <Canvas title="Demo"><Text>{bars.length}</Text></Canvas>;
}
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sdk = {
      Canvas: ({ title, children }: { title: string; children?: unknown }) =>
        React.createElement('section', { 'data-title': title }, children),
      Text: ({ children }: { children?: unknown }) => React.createElement('span', null, children),
    };
    const Component = instantiateCanvas(result.code, sdk, React, { bars: [1, 2, 3] });
    const tree = (Component as (props: object) => { props: { children: { props: { children: number } } } })(
      {},
    );
    expect(tree.props.children.props.children).toBe(3);
  });
});
