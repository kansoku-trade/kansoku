import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCanvasApplyPatchTool, buildCanvasTools } from '../src/canvas/tools.js';

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

    const refused = await byName.save_canvas.execute('1', {
      slug: 'gated',
      title: 'Gated',
      source,
    });
    expect(textOf(refused)).toContain('read_skill(name="canvas")');
    expect(textOf(await byName.read_canvas.execute('2', { slug: 'gated' }))).toContain('not found');

    read = true;
    expect(
      textOf(await byName.save_canvas.execute('3', { slug: 'gated', title: 'Gated', source })),
    ).toContain('saved slug=gated');
  });

  it('saves without a gate when no skillLoaded check is supplied', async () => {
    const { byName } = tools();
    expect(
      textOf(await byName.save_canvas.execute('1', { slug: 'free', title: 'Free', source })),
    ).toContain('saved slug=free');
  });
});

describe('canvas apply_patch', () => {
  const patchFor = (path: string, body: string): string =>
    `*** Begin Patch\n*** Update File: ${path}\n${body}\n*** End Patch`;

  it('applies several hunks in one call and keeps the canvas valid', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canvas-edit-'));
    const dir = join(root, 'journal', 'canvases');
    const { byName } = tools(dir);
    await byName.save_canvas.execute('save', { slug: 'mu-demo', title: 'MU demo', source });
    const edit = buildCanvasApplyPatchTool(root, dir);

    const result = await edit.execute('edit', {
      patch: patchFor(
        'journal/canvases/mu-demo.canvas.tsx',
        [
          '@@ export default function App() {',
          '-  return <Canvas title="Demo" caption="Longbridge · demo"><Text>ok</Text></Canvas>;',
          '+  return <Canvas title="Demo 2" caption="Longbridge · demo"><Text>updated</Text></Canvas>;',
        ].join('\n'),
      ),
    });

    expect(textOf(result)).toContain(
      'edited path=journal/canvases/mu-demo.canvas.tsx slug=mu-demo',
    );
    const read = await byName.read_canvas.execute('read', { slug: 'mu-demo' });
    expect(textOf(read)).toContain('<Text>updated</Text>');
    expect(textOf(read)).toContain('Demo 2');
  });

  it('rejects paths outside the canvas directory and hunks that do not match', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canvas-edit-'));
    const dir = join(root, 'journal', 'canvases');
    const { byName } = tools(dir);
    await byName.save_canvas.execute('save', { slug: 'mu-demo', title: 'MU demo', source });
    const edit = buildCanvasApplyPatchTool(root, dir);

    expect(
      textOf(await edit.execute('outside', { patch: patchFor('stocks/MU.md', '-a\n+b') })),
    ).toContain('path must be a journal/canvases');
    expect(
      textOf(
        await edit.execute('missing', {
          patch: patchFor(
            'journal/canvases/mu-demo.canvas.tsx',
            '-<Text>nope</Text>\n+<Text>x</Text>',
          ),
        }),
      ),
    ).toContain('lines not found');
    expect(textOf(await edit.execute('bad', { patch: 'not a patch' }))).toContain(
      'must start with',
    );
  });

  it('writes nothing when any file in the patch fails validation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'canvas-edit-'));
    const dir = join(root, 'journal', 'canvases');
    const { byName } = tools(dir);
    await byName.save_canvas.execute('save', { slug: 'mu-demo', title: 'MU demo', source });
    await byName.save_canvas.execute('save', { slug: 'nvda-demo', title: 'NVDA demo', source });
    const edit = buildCanvasApplyPatchTool(root, dir);

    const result = await edit.execute('edit', {
      patch: [
        '*** Begin Patch',
        '*** Update File: journal/canvases/mu-demo.canvas.tsx',
        '-  return <Canvas title="Demo" caption="Longbridge · demo"><Text>ok</Text></Canvas>;',
        '+  return <Canvas title="Demo" caption="Longbridge · demo"><Text>updated</Text></Canvas>;',
        '*** Update File: journal/canvases/nvda-demo.canvas.tsx',
        '-  return <Canvas title="Demo" caption="Longbridge · demo"><Text>ok</Text></Canvas>;',
        '+  return <Canvas title="Demo" caption="Longbridge · demo"><Text>{fetch("/bad")}</Text></Canvas>;',
        '*** End Patch',
      ].join('\n'),
    });

    expect(textOf(result)).toContain('edit failed: journal/canvases/nvda-demo.canvas.tsx');
    const read = await byName.read_canvas.execute('read', { slug: 'mu-demo' });
    expect(textOf(read)).toContain('<Text>ok</Text>');
  });
});
