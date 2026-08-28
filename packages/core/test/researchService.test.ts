import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveCanvas } from '../src/canvas/store.js';
import { researchCanvasPath } from '../src/contract/research.js';
import { createResearchService, writeResearchDocumentAtomic } from '../src/research/research.service.js';

let root: string;

function write(relativePath: string, content: string): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'research-service-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('research library listing', () => {
  it('presents stock notes and heterogeneous journal records through one metadata model', async () => {
    write('stocks/MU.md', '# MU 长期研究\n\n库存和 HBM 是当前验证重点。\n');
    write('journal/2026-07-14-MU-intraday.md', '## MU 短线重估\n\n保留当时判断。\n');
    write(
      'journal/2026-07-09-intraday-recap.md',
      '# 盘中自动小结\n\n## NVDA.US\n上涨。\n\n## MSFT.US\n震荡。\n',
    );
    write('journal/lessons.md', '# 交易教训清单\n\n- 不追逐未经确认的突破。\n');
    write('journal/charts/data/ignored.json', '{}');

    const rows = await createResearchService(root).list({});

    expect(rows.map((row) => row.path)).toEqual([
      'stocks/MU.md',
      'journal/2026-07-14-MU-intraday.md',
      'journal/2026-07-09-intraday-recap.md',
      'journal/lessons.md',
    ]);
    expect(rows.find((row) => row.path === 'stocks/MU.md')).toMatchObject({
      kind: 'stock',
      type: 'stock',
      title: 'MU 长期研究',
      symbols: ['MU'],
      excerpt: '库存和 HBM 是当前验证重点。',
    });
    expect(rows.find((row) => row.path.endsWith('intraday-recap.md'))).toMatchObject({
      kind: 'journal',
      type: 'recap',
      symbols: ['MSFT', 'NVDA'],
    });
    expect(rows.find((row) => row.path === 'journal/lessons.md')).toMatchObject({
      type: 'lessons',
      date: null,
    });
  });

  it('searches full markdown text without returning the markdown body in list rows', async () => {
    write('stocks/MU.md', '# MU\n\n正文中包含独有词：供给纪律。\n');
    write('stocks/NVDA.md', '# NVDA\n\n计算平台。\n');

    const rows = await createResearchService(root).list({ kind: 'stock', query: '供给纪律' });

    expect(rows).toHaveLength(1);
    expect(rows[0].path).toBe('stocks/MU.md');
    expect(rows[0]).not.toHaveProperty('markdown');
  });

  it('discovers nested journal markdown while ignoring symlinks', async () => {
    write('journal/decisions/2026-07-14-MU.md', '# MU 决策\n');
    write('outside.md', '# 不应读取\n');
    mkdirSync(join(root, 'journal', 'linked'), { recursive: true });
    symlinkSync(join(root, 'outside.md'), join(root, 'journal', 'linked', 'outside.md'));

    const rows = await createResearchService(root).list({ kind: 'journal' });

    expect(rows.map((row) => row.path)).toEqual(['journal/decisions/2026-07-14-MU.md']);
    expect(rows[0].type).toBe('decision');
  });

  it('rejects unknown views at the shared service boundary used by HTTP and IPC', async () => {
    const service = createResearchService(root);
    await expect(service.list({ kind: 'other' as 'stock' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('research document loading', () => {
  it('loads the selected markdown with the same metadata used by the list', async () => {
    write('journal/2026-07-14-MU-intraday.md', '# MU 复盘\n\n正文。\n');

    const document = await createResearchService(root).get({
      path: 'journal/2026-07-14-MU-intraday.md',
    });

    expect(document).toMatchObject({
      path: 'journal/2026-07-14-MU-intraday.md',
      kind: 'journal',
      title: 'MU 复盘',
      markdown: '# MU 复盘\n\n正文。\n',
    });
    expect(document.revision).toMatch(/^[\da-f]{64}$/);
  });

  it('rejects traversal and symlink escape paths', async () => {
    write('outside.md', 'secret');
    mkdirSync(join(root, 'journal'), { recursive: true });
    symlinkSync(join(root, 'outside.md'), join(root, 'journal', 'outside.md'));
    const service = createResearchService(root);

    await expect(service.get({ path: '../outside.md' })).rejects.toMatchObject({ status: 400 });
    await expect(service.get({ path: 'journal/outside.md' })).rejects.toMatchObject({
      status: 404,
    });
  });
});

const CANVAS_SOURCE = `import { Canvas, Text } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="MU 验收面板"><Text>ok</Text></Canvas>;
}
`;

describe('research library canvases', () => {
  it('lists canvases as a third kind and extracts symbols from title and slug', async () => {
    write('stocks/MU.md', '# MU\n\n档案。\n');
    const saved = await saveCanvas(join(root, 'journal', 'canvases'), {
      slug: 'acceptance-mu-panel',
      title: 'MU 验收面板',
      source: CANVAS_SOURCE,
    });
    expect(saved.ok).toBe(true);

    const all = await createResearchService(root).list({});
    const canvas = all.find((row) => row.kind === 'canvas');
    expect(canvas).toMatchObject({
      path: 'journal/canvases/acceptance-mu-panel.canvas.tsx',
      type: 'canvas',
      title: 'MU 验收面板',
      date: null,
      symbols: ['MU'],
      excerpt: 'MU 验收面板',
    });
    expect(canvas).not.toHaveProperty('markdown');
    expect(all[0].kind).toBe('stock');
    expect(all.at(-1)?.kind).toBe('canvas');

    const only = await createResearchService(root).list({ kind: 'canvas' });
    expect(only).toHaveLength(1);
    expect(only[0].path).toBe(researchCanvasPath('acceptance-mu-panel'));
  });

  it('searches canvas title and slug without returning source as markdown', async () => {
    await saveCanvas(join(root, 'journal', 'canvases'), {
      slug: 'acceptance-mu-panel',
      title: 'MU 验收面板',
      source: CANVAS_SOURCE,
    });

    const rows = await createResearchService(root).list({
      kind: 'canvas',
      query: 'acceptance-mu-panel',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('markdown');
  });

  it('gets a canvas as empty markdown with a source revision', async () => {
    const saved = await saveCanvas(join(root, 'journal', 'canvases'), {
      slug: 'acceptance-mu-panel',
      title: 'MU 验收面板',
      source: CANVAS_SOURCE,
    });
    if (!saved.ok) throw new Error('save failed');

    const document = await createResearchService(root).get({
      path: researchCanvasPath('acceptance-mu-panel'),
    });
    expect(document.markdown).toBe('');
    expect(document.title).toBe('MU 验收面板');
    expect(document.kind).toBe('canvas');
    expect(document.revision).toMatch(/^[\da-f]{64}$/);
    expect(document.revision).not.toBe(createHash('sha256').update('').digest('hex'));
  });

  it('exposes the event origin so a canvas can be traced back to its market event', async () => {
    const saved = await saveCanvas(join(root, 'journal', 'canvases'), {
      slug: 'event-abc123',
      title: 'MU 8-K',
      source: CANVAS_SOURCE,
      origin: { eventId: 'abc123', clusterId: 'cluster-1' },
    });
    if (!saved.ok) throw new Error('save failed');

    const service = createResearchService(root);
    const listed = await service.list({ kind: 'canvas' });
    expect(listed.find((row) => row.path.includes('event-abc123'))?.origin).toEqual({
      eventId: 'abc123',
      clusterId: 'cluster-1',
    });
    const document = await service.get({ path: researchCanvasPath('event-abc123') });
    expect(document.origin).toEqual({ eventId: 'abc123', clusterId: 'cluster-1' });
  });

  it('rejects canvas paths outside journal/canvases or with a bad slug', async () => {
    const service = createResearchService(root);
    await expect(service.get({ path: 'journal/other.canvas.tsx' })).rejects.toMatchObject({
      status: 400,
    });
    await expect(service.get({ path: 'journal/canvases/Not-Kebab.canvas.tsx' })).rejects.toMatchObject(
      { status: 400 },
    );
  });

  it('refuses to write a canvas through the markdown document API', async () => {
    await saveCanvas(join(root, 'journal', 'canvases'), {
      slug: 'acceptance-mu-panel',
      title: 'MU 验收面板',
      source: CANVAS_SOURCE,
    });
    const current = await createResearchService(root).get({
      path: researchCanvasPath('acceptance-mu-panel'),
    });
    await expect(
      writeResearchDocumentAtomic({
        rootDir: root,
        path: researchCanvasPath('acceptance-mu-panel'),
        markdown: '# no',
        expectedRevision: current.revision,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('skips .meta.json when listing canvases', async () => {
    await saveCanvas(join(root, 'journal', 'canvases'), {
      slug: 'acceptance-mu-panel',
      title: 'MU 验收面板',
      source: CANVAS_SOURCE,
    });
    const rows = await createResearchService(root).list({ kind: 'canvas' });
    expect(rows.every((row) => row.path.endsWith('.canvas.tsx'))).toBe(true);
  });
});
