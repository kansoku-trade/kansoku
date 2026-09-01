import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCanvasEditFileTool, buildCanvasTools } from '../src/canvas/tools.js';

const source = `import { Canvas, Text } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="Demo" caption="Longbridge · demo"><Text>ok</Text></Canvas>;
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

describe('canvas skill gate', () => {
  it('refuses to save until the canvas skill has been read', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'canvas-gate-'));
    let read = false;
    const byName = Object.fromEntries(
      buildCanvasTools(dir, { skillLoaded: () => read }).map((tool) => [tool.name, tool]),
    );

    const refused = await byName.save_canvas.execute('1', { slug: 'gated', title: 'Gated', source });
    expect(textOf(refused)).toContain('read_skill(name="canvas")');
    expect(textOf(await byName.read_canvas.execute('2', { slug: 'gated' }))).toContain('not found');

    read = true;
    expect(textOf(await byName.save_canvas.execute('3', { slug: 'gated', title: 'Gated', source }))).toContain(
      'saved slug=gated',
    );
  });

  it('saves without a gate when no skillLoaded check is supplied', async () => {
    const { byName } = tools();
    expect(textOf(await byName.save_canvas.execute('1', { slug: 'free', title: 'Free', source }))).toContain(
      'saved slug=free',
    );
  });
});

describe('canvas edit_file', () => {
  it('edits one exact fragment and keeps the canvas valid', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canvas-edit-'));
    const dir = join(root, 'journal', 'canvases');
    const { byName } = tools(dir);
    await byName.save_canvas.execute('save', { slug: 'mu-demo', title: 'MU demo', source });
    const edit = buildCanvasEditFileTool(root, dir);

    const result = await edit.execute('edit', {
      path: 'journal/canvases/mu-demo.canvas.tsx',
      old_text: '<Text>ok</Text>',
      new_text: '<Text>updated</Text>',
    });

    expect(textOf(result)).toContain('edited path=journal/canvases/mu-demo.canvas.tsx');
    const read = await byName.read_canvas.execute('read', { slug: 'mu-demo' });
    expect(textOf(read)).toContain('<Text>updated</Text>');
  });

  it('rejects paths outside the canvas directory and ambiguous replacements', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canvas-edit-'));
    const dir = join(root, 'journal', 'canvases');
    const { byName } = tools(dir);
    await byName.save_canvas.execute('save', {
      slug: 'mu-demo',
      title: 'MU demo',
      source: source.replace('<Text>ok</Text>', '<><Text>ok</Text><Text>ok</Text></>'),
    });
    const edit = buildCanvasEditFileTool(root, dir);

    expect(
      textOf(
        await edit.execute('outside', {
          path: 'stocks/MU.md',
          old_text: 'a',
          new_text: 'b',
        }),
      ),
    ).toContain('path must be a journal/canvases');
    expect(
      textOf(
        await edit.execute('ambiguous', {
          path: 'journal/canvases/mu-demo.canvas.tsx',
          old_text: '<Text>ok</Text>',
          new_text: '<Text>updated</Text>',
        }),
      ),
    ).toContain('old_text is not unique');
  });

  it('validates the resulting source before writing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canvas-edit-'));
    const dir = join(root, 'journal', 'canvases');
    const { byName } = tools(dir);
    await byName.save_canvas.execute('save', { slug: 'mu-demo', title: 'MU demo', source });
    const edit = buildCanvasEditFileTool(root, dir);

    const result = await edit.execute('edit', {
      path: 'journal/canvases/mu-demo.canvas.tsx',
      old_text: '<Text>ok</Text>',
      new_text: '<Text>{fetch("/bad")}</Text>',
    });

    expect(textOf(result)).toContain('edit failed:');
    const read = await byName.read_canvas.execute('read', { slug: 'mu-demo' });
    expect(textOf(read)).toContain('<Text>ok</Text>');
  });
});
