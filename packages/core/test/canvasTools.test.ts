import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCanvasTools } from '../src/canvas/tools.js';

const source = `import { Canvas, Text } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="Demo"><Text>ok</Text></Canvas>;
}
`;

function textOf(result: { content: { type: string; text?: string }[] }): string {
  return (result.content[0] as { text: string }).text;
}

function tools(dir = mkdtempSync(join(tmpdir(), 'canvas-tools-'))) {
  const built = buildCanvasTools(dir);
  const byName = Object.fromEntries(built.map((tool) => [tool.name, tool]));
  return { dir, byName };
}

describe('buildCanvasTools', () => {
  it('exposes save_canvas, read_canvas, list_canvases', () => {
    const { byName } = tools();
    expect(Object.keys(byName).sort()).toEqual(['list_canvases', 'read_canvas', 'save_canvas']);
  });

  it('saves then reads a canvas as JSON', async () => {
    const { byName } = tools();
    const saved = await byName.save_canvas.execute('c1', {
      slug: 'mu-demo',
      title: 'MU demo',
      source,
    });
    expect(textOf(saved)).toBe('saved slug=mu-demo title=MU demo');

    const read = await byName.read_canvas.execute('c2', { slug: 'mu-demo' });
    const doc = JSON.parse(textOf(read)) as { slug: string; title: string; source: string };
    expect(doc.slug).toBe('mu-demo');
    expect(doc.title).toBe('MU demo');
    expect(doc.source).toBe(source);
  });

  it('rejects invalid source with a rejected: prefix', async () => {
    const { byName } = tools();
    const result = await byName.save_canvas.execute('c1', {
      slug: 'bad',
      title: 'bad',
      source: 'export function App() { return null; }\n',
    });
    const text = textOf(result);
    expect(text.startsWith('rejected:')).toBe(true);
    expect(text).toMatch(/export default/i);
  });

  it('read of a missing canvas is rejected', async () => {
    const { byName } = tools();
    const result = await byName.read_canvas.execute('c1', { slug: 'missing' });
    expect(textOf(result)).toBe('rejected: canvas not found: missing');
  });

  it('lists saved canvases', async () => {
    const { byName } = tools();
    await byName.save_canvas.execute('c1', { slug: 'alpha', title: 'Alpha', source });
    const listed = await byName.list_canvases.execute('c2', {});
    const items = JSON.parse(textOf(listed)) as { slug: string; title: string }[];
    expect(items).toEqual([expect.objectContaining({ slug: 'alpha', title: 'Alpha' })]);
  });
});
