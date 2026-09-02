import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const build = vi.hoisted(() => ({ buildChart: vi.fn() }));
vi.mock('../src/charts/build.js', () => build);

const { buildCanvasApplyPatchTool, buildCanvasTools, transcriptHasSkillRead } =
  await import('../src/canvas/tools.js');

afterEach(() => {
  build.buildChart.mockReset();
});

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

function timeframe(offset: number) {
  return {
    candles: [{ time: offset, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
    volumes: [],
    emas: [],
    macdDif: [],
    macdDea: [],
    macdHist: [],
    macdCrossMarkers: [],
    markers: [],
    priceConnectors: [],
    macdConnectors: [],
    autoDivergence: [],
    autoBeichi: [],
  };
}

describe('buildCanvasTools', () => {
  it('exposes save_canvas, read_canvas, list_canvases, save_canvas_data, snapshot_candles', () => {
    const { byName } = tools();
    expect(Object.keys(byName).sort()).toEqual([
      'list_canvases',
      'read_canvas',
      'save_canvas',
      'save_canvas_data',
      'snapshot_candles',
    ]);
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

describe('save_canvas_data', () => {
  it('saves data for an existing canvas and reports byte length', async () => {
    const { byName } = tools();
    await byName.save_canvas.execute('c1', { slug: 'mu-demo', title: 'MU demo', source });
    const result = await byName.save_canvas_data.execute('c2', {
      slug: 'mu-demo',
      name: 'bars',
      json: '[1,2,3]',
    });
    expect(textOf(result)).toBe('saved data slug=mu-demo name=bars bytes=7');
  });

  it('rejects when the canvas does not exist', async () => {
    const { byName } = tools();
    const result = await byName.save_canvas_data.execute('c1', {
      slug: 'missing',
      name: 'bars',
      json: '[1]',
    });
    expect(textOf(result)).toBe('rejected:\ncanvas not found');
  });

  it('is gated by skillLoaded', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'canvas-gate-'));
    let read = false;
    const byName = Object.fromEntries(
      buildCanvasTools(dir, { skillLoaded: () => read }).map((tool) => [tool.name, tool]),
    );
    await byName.save_canvas.execute('c0', { slug: 'mu-demo', title: 'MU demo', source: source });
    const refused = await byName.save_canvas_data.execute('c1', {
      slug: 'mu-demo',
      name: 'bars',
      json: '[1]',
    });
    expect(textOf(refused)).toContain('read_skill(name="canvas")');
  });
});

function heavyTimeframe(offset: number) {
  const bars = Array.from({ length: 1000 }, (_, index) => offset + index * 300);
  const marker = (time: number) => ({
    time,
    position: 'aboveBar' as const,
    color: '#26a69a',
    shape: 'circle' as const,
    text: `auto signal at ${time} with a fairly long tooltip body`,
    id: `marker-${time}`,
    tooltip: 'server-side automatic annotation, not agent authored, kept out of the feed',
  });
  return {
    candles: bars.map((time) => ({ time, open: 10.5, high: 11.25, low: 10.125, close: 10.875 })),
    volumes: bars.map((time) => ({ time, value: 1234567, color: '#26a69a' })),
    emas: [
      { period: 20, data: bars.map((time) => ({ time, value: 10.6 })) },
      { period: 50, data: bars.map((time) => ({ time, value: 10.4 })) },
    ],
    vwap: bars.map((time) => ({ time, value: 10.55 })),
    macdDif: bars.map((time) => ({ time, value: 0.125 })),
    macdDea: bars.map((time) => ({ time, value: 0.0625 })),
    macdHist: bars.map((time) => ({ time, value: 0.0625, color: '#26a69a' })),
    macdCrossMarkers: bars.map(marker),
    markers: bars.map(marker),
    priceConnectors: [],
    macdConnectors: [],
    autoDivergence: [],
    autoBeichi: [],
    offSession: [
      { startTime: offset - 100_000, endTime: offset - 1, kind: 'pre' as const },
      {
        startTime: bars[bars.length - 1] - 60,
        endTime: bars[bars.length - 1],
        kind: 'post' as const,
      },
    ],
  };
}

describe('snapshot_candles', () => {
  it('projects and tails a real-sized build under the 512 KB data cap', async () => {
    const timeframes = {
      m5: heavyTimeframe(1_000_000),
      m15: heavyTimeframe(2_000_000),
      h1: heavyTimeframe(3_000_000),
    };
    expect(JSON.stringify(timeframes).length).toBeGreaterThan(512 * 1024);
    build.buildChart.mockResolvedValueOnce({ built: { kind: 'intraday', timeframes } });
    const { byName, dir } = tools();
    await byName.save_canvas.execute('c1', { slug: 'mu-demo', title: 'MU demo', source });

    const result = await byName.snapshot_candles.execute('c2', {
      slug: 'mu-demo',
      name: 'snap',
      symbol: 'MU',
    });
    expect(textOf(result)).toBe(
      'snapshot saved slug=mu-demo name=snap symbol=MU.US bars m5=300 m15=300 h1=300',
    );

    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const file = path.join(dir, 'mu-demo.snap.json');
    const raw = await fs.readFile(file, 'utf8');
    expect(Buffer.byteLength(raw, 'utf8')).toBeLessThan(512 * 1024);
    const feed = JSON.parse(raw) as { timeframes: Record<string, Record<string, unknown>> };
    for (const key of ['m5', 'm15', 'h1']) {
      const tf = feed.timeframes[key];
      expect(Object.keys(tf).sort()).toEqual([
        'candles',
        'emas',
        'macdDea',
        'macdDif',
        'macdHist',
        'offSession',
        'volumes',
      ]);
      expect((tf.candles as unknown[]).length).toBe(300);
      expect((tf.volumes as unknown[]).length).toBe(300);
      expect((tf.macdHist as unknown[]).length).toBe(300);
      expect((tf.emas as { data: unknown[] }[])[0].data.length).toBe(300);
      expect((tf.offSession as unknown[]).length).toBe(1);
    }
  });

  it('writes a CandleFeed-shaped data file from buildChart', async () => {
    build.buildChart.mockResolvedValueOnce({
      built: {
        kind: 'intraday',
        timeframes: { m5: timeframe(1), m15: timeframe(2), h1: timeframe(3) },
      },
    });
    const { byName, dir } = tools();
    await byName.save_canvas.execute('c1', { slug: 'mu-demo', title: 'MU demo', source });

    const result = await byName.snapshot_candles.execute('c2', {
      slug: 'mu-demo',
      name: 'snap',
      symbol: 'mu',
    });
    expect(textOf(result)).toBe(
      'snapshot saved slug=mu-demo name=snap symbol=MU.US bars m5=1 m15=1 h1=1',
    );
    expect(build.buildChart).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'intraday',
        symbol: 'MU.US',
        session: 'all',
        skip_news: true,
        day_kline_lazy: true,
        enrichment_lazy: true,
      }),
    );

    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const raw = await fs.readFile(path.join(dir, 'mu-demo.snap.json'), 'utf8');
    const feed = JSON.parse(raw) as {
      symbol: string;
      asOf: string;
      timeframes: Record<string, unknown>;
    };
    expect(feed.symbol).toBe('MU.US');
    expect(typeof feed.asOf).toBe('string');
    expect(Object.keys(feed.timeframes).sort()).toEqual(['h1', 'm15', 'm5']);
  });

  it('rejects when the canvas does not exist', async () => {
    const { byName } = tools();
    const result = await byName.snapshot_candles.execute('c1', {
      slug: 'missing',
      name: 'snap',
      symbol: 'MU',
    });
    expect(textOf(result)).toContain('rejected: canvas not found: missing');
    expect(build.buildChart).not.toHaveBeenCalled();
  });

  it('reports a build failure', async () => {
    build.buildChart.mockRejectedValueOnce(new Error('longbridge unavailable'));
    const { byName } = tools();
    await byName.save_canvas.execute('c1', { slug: 'mu-demo', title: 'MU demo', source });
    const result = await byName.snapshot_candles.execute('c2', {
      slug: 'mu-demo',
      name: 'snap',
      symbol: 'MU',
    });
    expect(textOf(result)).toBe('rejected: longbridge unavailable');
  });
});

describe('read_canvas data listing', () => {
  it('returns dataFiles metadata instead of raw data content', async () => {
    build.buildChart.mockResolvedValueOnce({
      built: {
        kind: 'intraday',
        timeframes: { m5: timeframe(1), m15: timeframe(2), h1: timeframe(3) },
      },
    });
    const { byName } = tools();
    await byName.save_canvas.execute('c1', { slug: 'mu-demo', title: 'MU demo', source });
    await byName.save_canvas_data.execute('c2', {
      slug: 'mu-demo',
      name: 'bars',
      json: '[1,2,3]',
    });
    await byName.snapshot_candles.execute('c3', { slug: 'mu-demo', name: 'snap', symbol: 'MU' });

    const read = await byName.read_canvas.execute('c4', { slug: 'mu-demo' });
    const doc = JSON.parse(textOf(read)) as {
      data?: unknown;
      dataFiles: { name: string; bytes: number; shape: string }[];
    };
    expect(doc.data).toBeUndefined();
    const byName2 = Object.fromEntries(doc.dataFiles.map((f) => [f.name, f]));
    expect(byName2.bars.shape).toBe('array[3]');
    expect(byName2.snap.shape).toMatch(/^object\{/);
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

describe('transcriptHasSkillRead', () => {
  const call = (name: string, args: unknown) =>
    ({
      role: 'assistant',
      content: [{ type: 'toolCall', id: 't1', name, arguments: args }],
    }) as unknown as import('@earendil-works/pi-agent-core').AgentMessage;

  it('finds a read_skill call for the given skill', () => {
    expect(transcriptHasSkillRead([call('read_skill', { name: 'canvas' })], 'canvas')).toBe(true);
  });

  it('ignores other skills, other tools, and user messages', () => {
    expect(transcriptHasSkillRead([call('read_skill', { name: 'chart' })], 'canvas')).toBe(false);
    expect(transcriptHasSkillRead([call('read_file', { path: 'x' })], 'canvas')).toBe(false);
    expect(
      transcriptHasSkillRead([{ role: 'user', content: 'read_skill canvas' } as never], 'canvas'),
    ).toBe(false);
  });
});
