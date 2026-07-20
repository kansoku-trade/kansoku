import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Annotation } from '@kansoku/shared/types';

let annotationsDir: string;

vi.mock('../src/platform/env.js', async () => {
  const actual = await vi.importActual<typeof import('../src/platform/env.js')>('../src/platform/env.js');
  return {
    ...actual,
    get ANNOTATIONS_DIR() {
      return annotationsDir;
    },
  };
});

const { buildReadDrawingsTool, buildDrawAnnotationsTool } = await import('../src/ai/agents/dataTools.js');
const { annotationsService } = await import('../src/charts/annotations.service.js');
const { saveAnnotations } = await import('../src/charts/annotations.js');

const SYMBOL = 'MU.US';

function textOf(result: { content: { type: string; text?: string }[] }): string {
  return result.content.map((b) => b.text ?? '').join('');
}

function seedAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'user-1',
    kind: 'trendline',
    points: [
      { time: 1_700_000_000, price: 100 },
      { time: 1_700_003_600, price: 110 },
    ],
    createdAt: 1_700_000_000_000,
    source: 'user',
    label: '用户画的趋势线',
    ...overrides,
  };
}

function readTool() {
  return buildReadDrawingsTool(SYMBOL, (sym) => annotationsService.list({ symbol: sym }));
}

function sequentialGenId(prefix = 'ai'): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function drawTool(nowMs = 1_700_100_000_000, genId = sequentialGenId()) {
  return buildDrawAnnotationsTool(SYMBOL, {
    readAnnotations: (sym) => annotationsService.list({ symbol: sym }),
    writeAnnotations: async (sym, annotations) => {
      await annotationsService.replace({ symbol: sym, annotations });
    },
    now: () => nowMs,
    genId,
  });
}

beforeEach(async () => {
  annotationsDir = await mkdtemp(join(tmpdir(), 'datatools-drawings-test-'));
});

afterEach(async () => {
  await rm(annotationsDir, { recursive: true, force: true });
});

describe('read_drawings', () => {
  it('says so rather than erroring when there are no annotations', async () => {
    const payload = JSON.parse(textOf(await readTool().execute('id', {})));
    expect(payload.count).toBe(0);
    expect(payload.drawings).toEqual([]);
    expect(typeof payload.note).toBe('string');
    expect(payload.note.length).toBeGreaterThan(0);
  });

  it('returns id/kind/source/label/createdAt and formatted-time points, defaulting source to user', async () => {
    await saveAnnotations(SYMBOL, [seedAnnotation({ source: undefined })]);

    const payload = JSON.parse(textOf(await readTool().execute('id', {})));
    expect(payload.count).toBe(1);
    const [drawing] = payload.drawings;
    expect(drawing.id).toBe('user-1');
    expect(drawing.kind).toBe('trendline');
    expect(drawing.source).toBe('user');
    expect(drawing.label).toBe('用户画的趋势线');
    expect(drawing.createdAt).toBe(1_700_000_000_000);
    expect(drawing.points).toHaveLength(2);
    expect(drawing.points[0].price).toBe(100);
    expect(typeof drawing.points[0].time).toBe('string');
    expect(drawing.points[0].time).toContain('ET');
  });

  it('passes a stored polyline through with its kind and all points intact', async () => {
    await saveAnnotations(SYMBOL, [
      seedAnnotation({
        id: 'user-2',
        kind: 'polyline',
        points: [
          { time: 1_700_000_000, price: 100 },
          { time: 1_700_003_600, price: 105 },
          { time: 1_700_007_200, price: 102 },
        ],
        label: '折线示例',
        style: { arrow: true },
      }),
    ]);

    const payload = JSON.parse(textOf(await readTool().execute('id', {})));
    expect(payload.count).toBe(1);
    const [drawing] = payload.drawings;
    expect(drawing.kind).toBe('polyline');
    expect(drawing.points).toHaveLength(3);
  });
});

describe('draw_annotations', () => {
  it('exposes polyline as an allowed kind and arrow as a boolean style option in the schema', () => {
    const schema = drawTool().parameters as {
      properties: {
        annotations: {
          items: {
            properties: {
              kind: { anyOf: { const: string }[] };
              style: { properties: { arrow: { type: string } } };
            };
          };
        };
      };
    };
    const kindValues = schema.properties.annotations.items.properties.kind.anyOf.map(
      (k) => k.const,
    );
    expect(kindValues).toContain('polyline');
    expect(schema.properties.annotations.items.properties.style.properties.arrow.type).toBe(
      'boolean',
    );
  });

  it('mentions polyline and arrow usage in its description', () => {
    const description = drawTool().description ?? '';
    expect(description).toContain('polyline');
    expect(description).toContain('arrow');
  });

  it('appends with generated ids, forced source ai, and existing entries untouched', async () => {
    await saveAnnotations(SYMBOL, [seedAnnotation()]);

    const result = await drawTool().execute('id', {
      annotations: [
        { kind: 'hline', points: [{ time: 1_700_100_000, price: 120 }], label: '日内关键阻力' },
        {
          kind: 'trendline',
          points: [
            { time: 1_700_100_000, price: 100 },
            { time: 1_700_103_600, price: 105 },
          ],
          label: '上升趋势线',
          style: { color: '#3B82F6', width: 2, dash: true },
        },
      ],
    });

    const text = textOf(result);
    expect(text).toContain('ai-1');
    expect(text).toContain('ai-2');
    expect(text).toContain('日内关键阻力');
    expect(text).toContain('上升趋势线');

    const stored = await annotationsService.list({ symbol: SYMBOL });
    expect(stored).toHaveLength(3);
    expect(stored[0]).toEqual(seedAnnotation());

    const created = stored.slice(1);
    expect(created.map((a) => a.id)).toEqual(['ai-1', 'ai-2']);
    for (const a of created) {
      expect(a.source).toBe('ai');
      expect(a.createdAt).toBe(1_700_100_000_000);
    }
    expect(created[1].style).toEqual({ color: '#3B82F6', width: 2, dash: true });
  });

  it('draws a valid 3-point polyline with arrow, persisted with source ai', async () => {
    const result = await drawTool().execute('id', {
      annotations: [
        {
          kind: 'polyline',
          points: [
            { time: 1_700_100_000, price: 100 },
            { time: 1_700_103_600, price: 105 },
            { time: 1_700_107_200, price: 102 },
          ],
          label: '三段走势连成的折线',
          style: { arrow: true },
        },
      ],
    });

    expect(textOf(result)).toContain('ai-1');

    const stored = await annotationsService.list({ symbol: SYMBOL });
    expect(stored).toHaveLength(1);
    expect(stored[0].kind).toBe('polyline');
    expect(stored[0].source).toBe('ai');
    expect(stored[0].points).toHaveLength(3);
    expect(stored[0].style).toEqual({ arrow: true });
  });

  it('rejects a 1-point polyline for the whole call, with no partial write', async () => {
    await saveAnnotations(SYMBOL, [seedAnnotation()]);

    const result = await drawTool().execute('id', {
      annotations: [
        {
          kind: 'polyline',
          points: [{ time: 1_700_100_000, price: 100 }],
          label: '只有一个点的折线',
        },
      ],
    });
    expect(textOf(result)).toContain('rejected');
    expect(textOf(result)).toContain('polyline');

    const stored = await annotationsService.list({ symbol: SYMBOL });
    expect(stored).toEqual([seedAnnotation()]);
  });

  it('rejects a non-boolean arrow value, with no partial write', async () => {
    await saveAnnotations(SYMBOL, [seedAnnotation()]);

    const result = await drawTool().execute('id', {
      annotations: [
        {
          kind: 'trendline',
          points: [
            { time: 1_700_100_000, price: 100 },
            { time: 1_700_103_600, price: 105 },
          ],
          label: '带非法 arrow 值的趋势线',
          style: { arrow: 'yes' as unknown as boolean },
        },
      ],
    });
    expect(textOf(result)).toContain('rejected');

    const stored = await annotationsService.list({ symbol: SYMBOL });
    expect(stored).toEqual([seedAnnotation()]);
  });

  it('rejects the whole call when more than 4 items are submitted, with no partial write', async () => {
    await saveAnnotations(SYMBOL, [seedAnnotation()]);

    const items = Array.from({ length: 5 }, (_, i) => ({
      kind: 'hline' as const,
      points: [{ time: 1_700_100_000 + i, price: 100 + i }],
      label: `第 ${i} 条`,
    }));

    const result = await drawTool().execute('id', { annotations: items });
    expect(textOf(result)).toContain('rejected');

    const stored = await annotationsService.list({ symbol: SYMBOL });
    expect(stored).toEqual([seedAnnotation()]);
  });

  it('rejects the whole call when any item is missing a label, with no partial write', async () => {
    await saveAnnotations(SYMBOL, [seedAnnotation()]);

    const result = await drawTool().execute('id', {
      annotations: [
        { kind: 'hline', points: [{ time: 1_700_100_000, price: 120 }], label: '有效标签' },
        { kind: 'hline', points: [{ time: 1_700_100_100, price: 121 }], label: '' },
      ],
    });
    expect(textOf(result)).toContain('rejected');

    const stored = await annotationsService.list({ symbol: SYMBOL });
    expect(stored).toEqual([seedAnnotation()]);
  });

  it('rejects the whole call when service validation fails (bad point count), with no partial write', async () => {
    await saveAnnotations(SYMBOL, [seedAnnotation()]);

    const result = await drawTool().execute('id', {
      annotations: [
        {
          kind: 'hline',
          points: [
            { time: 1_700_100_000, price: 120 },
            { time: 1_700_100_100, price: 121 },
          ],
          label: '水平线不该有两个点',
        },
      ],
    });
    expect(textOf(result)).toContain('rejected');

    const stored = await annotationsService.list({ symbol: SYMBOL });
    expect(stored).toEqual([seedAnnotation()]);
  });
});
