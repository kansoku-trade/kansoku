import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  listCanvases,
  loadCanvas,
  recordCanvasCheck,
  saveCanvas,
} from '../src/canvas/store.js';

const source = `import { Canvas, Text } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="Demo"><Text>ok</Text></Canvas>;
}
`;

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'canvas-store-'));
}

describe('canvas store', () => {
  it('saves source and title, then loads them back', async () => {
    const dir = tempDir();
    const now = () => new Date('2026-08-28T07:00:00.000Z');
    const result = await saveCanvas(dir, {
      slug: 'mu-demo',
      title: 'MU demo',
      source,
      now,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.slug).toBe('mu-demo');
    expect(result.doc.title).toBe('MU demo');
    expect(result.doc.source).toBe(source);
    expect(existsSync(join(dir, 'mu-demo.canvas.tsx'))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, '.meta.json'), 'utf8'))).toMatchObject({
      'mu-demo': { title: 'MU demo' },
    });

    const loaded = await loadCanvas(dir, 'mu-demo');
    expect(loaded?.title).toBe('MU demo');
    expect(loaded?.source).toBe(source);
    expect(loaded?.check).toBeNull();
  });

  it('overwrites the same slug', async () => {
    const dir = tempDir();
    await saveCanvas(dir, { slug: 'mu-demo', title: 'A', source });
    const next = `${source}\n`;
    const result = await saveCanvas(dir, { slug: 'mu-demo', title: 'B', source: next });
    expect(result.ok).toBe(true);
    const loaded = await loadCanvas(dir, 'mu-demo');
    expect(loaded?.title).toBe('B');
    expect(loaded?.source).toBe(next);
    expect(await listCanvases(dir)).toHaveLength(1);
  });

  it('rejects a bad slug and writes nothing', async () => {
    const dir = tempDir();
    const result = await saveCanvas(dir, { slug: '../etc/passwd', title: 'x', source });
    expect(result).toEqual({ ok: false, issues: ['slug must be kebab-case'] });
    expect(existsSync(join(dir, '.meta.json'))).toBe(false);
  });

  it('rejects failing source and writes nothing', async () => {
    const dir = tempDir();
    const result = await saveCanvas(dir, {
      slug: 'bad-canvas',
      title: 'bad',
      source: 'export function App() { return null; }\n',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThan(0);
    expect(existsSync(join(dir, 'bad-canvas.canvas.tsx'))).toBe(false);
  });

  it('lists canvases newest first', async () => {
    const dir = tempDir();
    await saveCanvas(dir, { slug: 'older', title: 'Older', source });
    await new Promise((r) => setTimeout(r, 20));
    await saveCanvas(dir, { slug: 'newer', title: 'Newer', source });
    const list = await listCanvases(dir);
    expect(list.map((item) => item.slug)).toEqual(['newer', 'older']);
    expect(list[0].title).toBe('Newer');
  });

  it('records a check that loadCanvas returns', async () => {
    const dir = tempDir();
    const now = () => new Date('2026-08-28T08:00:00.000Z');
    await saveCanvas(dir, { slug: 'mu-demo', title: 'MU demo', source, now });
    await recordCanvasCheck(
      dir,
      'mu-demo',
      { issues: ['Unexpected token'], stage: 'compile' },
      now,
    );
    const loaded = await loadCanvas(dir, 'mu-demo');
    expect(loaded?.check).toEqual({
      issues: ['Unexpected token'],
      stage: 'compile',
      updatedAt: '2026-08-28T08:00:00.000Z',
    });
  });

  it('returns null for a missing canvas', async () => {
    expect(await loadCanvas(tempDir(), 'missing')).toBeNull();
  });
});
