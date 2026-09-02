import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadCanvas, saveCanvas, saveCanvasData, setCanvasOrigin } from '../src/canvas/store.js';

const dirs: string[] = [];

function dir(): string {
  const created = mkdtempSync(path.join(tmpdir(), 'kansoku-canvas-'));
  dirs.push(created);
  return created;
}

const SOURCE = `import { Canvas, Section, Text } from '@kansoku/canvas';

export default function App() {
  return (
    <Canvas title="事件画布" caption="Longbridge · demo">
      <Section title="证据">
        <Text>原消息</Text>
      </Section>
    </Canvas>
  );
}
`;

afterEach(() => {
  for (const created of dirs.splice(0)) rmSync(created, { recursive: true, force: true });
});

describe('canvas origin', () => {
  it('stores an event origin on the canvas meta', async () => {
    const root = dir();
    const saved = await saveCanvas(root, {
      slug: 'event-abc123',
      title: 'MU 8-K',
      source: SOURCE,
      origin: { eventId: 'abc123', clusterId: 'cluster-1' },
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.doc.origin).toEqual({ eventId: 'abc123', clusterId: 'cluster-1' });

    const loaded = await loadCanvas(root, 'event-abc123');
    expect(loaded?.origin).toEqual({ eventId: 'abc123', clusterId: 'cluster-1' });
  });

  it('keeps the origin when the same slug is overwritten without a new one', async () => {
    const root = dir();
    await saveCanvas(root, {
      slug: 'event-abc123',
      title: 'MU 8-K',
      source: SOURCE,
      origin: { eventId: 'abc123', clusterId: 'cluster-1' },
    });
    const again = await saveCanvas(root, {
      slug: 'event-abc123',
      title: 'MU 8-K 更新',
      source: SOURCE.replace('原消息', '更新后的消息'),
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.doc.origin).toEqual({ eventId: 'abc123', clusterId: 'cluster-1' });
  });

  it('can attach origin after a save that did not have one', async () => {
    const root = dir();
    await saveCanvas(root, { slug: 'event-abc123', title: 'MU 8-K', source: SOURCE });
    await setCanvasOrigin(root, 'event-abc123', { eventId: 'abc123', clusterId: 'c1' });
    expect((await loadCanvas(root, 'event-abc123'))?.origin).toEqual({
      eventId: 'abc123',
      clusterId: 'c1',
    });
  });
});

describe('saveCanvasData', () => {
  it('rejects when the canvas does not exist', async () => {
    const root = dir();
    const result = await saveCanvasData(root, { slug: 'missing', name: 'bars', json: '[1]' });
    expect(result).toEqual({ ok: false, issues: ['canvas not found'] });
  });

  it('rejects an invalid data file name', async () => {
    const root = dir();
    await saveCanvas(root, { slug: 'mu-demo', title: 'MU demo', source: SOURCE });
    const result = await saveCanvasData(root, { slug: 'mu-demo', name: 'Bars', json: '[1]' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBe(1);
  });

  it('rejects invalid JSON', async () => {
    const root = dir();
    await saveCanvas(root, { slug: 'mu-demo', title: 'MU demo', source: SOURCE });
    const result = await saveCanvasData(root, { slug: 'mu-demo', name: 'bars', json: '{not json' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBe(1);
  });

  it('rejects a file over 512 KB', async () => {
    const root = dir();
    await saveCanvas(root, { slug: 'mu-demo', title: 'MU demo', source: SOURCE });
    const big = JSON.stringify('x'.repeat(512 * 1024 + 1));
    const result = await saveCanvasData(root, { slug: 'mu-demo', name: 'bars', json: big });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBe(1);
  });

  it('writes the file on success', async () => {
    const root = dir();
    await saveCanvas(root, { slug: 'mu-demo', title: 'MU demo', source: SOURCE });
    const result = await saveCanvasData(root, { slug: 'mu-demo', name: 'bars', json: '[1,2,3]' });
    expect(result).toEqual({ ok: true });
    const loaded = await loadCanvas(root, 'mu-demo');
    expect(loaded?.data).toEqual({ bars: [1, 2, 3] });
  });
});

describe('loadCanvas data', () => {
  it('loads all <slug>.*.json files into data, skipping bad JSON', async () => {
    const root = dir();
    await saveCanvas(root, { slug: 'mu-demo', title: 'MU demo', source: SOURCE });
    await saveCanvasData(root, { slug: 'mu-demo', name: 'bars', json: '[1,2,3]' });
    const fs = await import('node:fs/promises');
    await fs.writeFile(path.join(root, 'mu-demo.broken.json'), '{not json', 'utf8');

    const loaded = await loadCanvas(root, 'mu-demo');
    expect(loaded?.data).toEqual({ bars: [1, 2, 3] });
  });

  it('returns an empty data object when there are no data files', async () => {
    const root = dir();
    await saveCanvas(root, { slug: 'mu-demo', title: 'MU demo', source: SOURCE });
    expect((await loadCanvas(root, 'mu-demo'))?.data).toEqual({});
  });
});

describe('saveCanvas missing data file', () => {
  it('rejects a canvas that imports a json file that does not exist', async () => {
    const root = dir();
    const source = SOURCE.replace(
      "import { Canvas, Section, Text } from '@kansoku/canvas';",
      "import { Canvas, Section, Text } from '@kansoku/canvas';\nimport bars from './bars.json';",
    );
    const result = await saveCanvas(root, { slug: 'mu-demo', title: 'MU demo', source });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContain('missing data file: mu-demo.bars.json');
  });

  it('accepts once the data file has been written', async () => {
    const root = dir();
    const source = SOURCE.replace(
      "import { Canvas, Section, Text } from '@kansoku/canvas';",
      "import { Canvas, Section, Text } from '@kansoku/canvas';\nimport bars from './bars.json';",
    );
    const fs = await import('node:fs/promises');
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, 'mu-demo.bars.json'), '[1,2,3]', 'utf8');
    const result = await saveCanvas(root, { slug: 'mu-demo', title: 'MU demo', source });
    expect(result.ok).toBe(true);
  });
});
