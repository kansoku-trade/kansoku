import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Annotation } from '@kansoku/shared/types';

let annotationsDir: string;

vi.mock('@kansoku/core/platform/env', async () => {
  const actual = await vi.importActual<typeof import('@kansoku/core/platform/env')>('@kansoku/core/platform/env');
  return {
    ...actual,
    get ANNOTATIONS_DIR() {
      return annotationsDir;
    },
  };
});

const { tsukiRequest } = await import('./helpers.js');

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'ann-1',
    kind: 'trendline',
    points: [
      { time: 1700000000, price: 100 },
      { time: 1700000100, price: 110 },
    ],
    createdAt: 1700000000000,
    ...overrides,
  };
}

beforeEach(async () => {
  annotationsDir = await mkdtemp(join(tmpdir(), 'annotations-test-'));
});

afterEach(async () => {
  await rm(annotationsDir, { recursive: true, force: true });
});

describe('GET /:symbol', () => {
  it('returns an empty array for an unknown symbol', async () => {
    const res = await tsukiRequest('/api/annotations/NVDA.US');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: [] });
  });
});

describe('PUT /:symbol then GET', () => {
  it('round-trips a saved annotation list', async () => {
    const annotations = [
      makeAnnotation(),
      makeAnnotation({ id: 'ann-2', kind: 'hline', points: [{ time: 1700000000, price: 105 }] }),
    ];

    const putRes = await tsukiRequest('/api/annotations/NVDA.US', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ annotations }),
    });
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toEqual({ ok: true, data: { count: 2 } });

    const getRes = await tsukiRequest('/api/annotations/nvda.us');
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toEqual({ ok: true, data: annotations });
  });
});

describe('PUT /:symbol validation', () => {
  it('rejects a body missing the annotations key', async () => {
    const res = await tsukiRequest('/api/annotations/NVDA.US', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  it('rejects an unknown annotation kind', async () => {
    const res = await tsukiRequest('/api/annotations/NVDA.US', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        annotations: [makeAnnotation({ kind: 'circle' as Annotation['kind'] })],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects an hline annotation with 2 points', async () => {
    const res = await tsukiRequest('/api/annotations/NVDA.US', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ annotations: [makeAnnotation({ kind: 'hline' })] }),
    });
    expect(res.status).toBe(400);
  });

  it('accepts an annotation with source, label, and style set', async () => {
    const annotations = [
      makeAnnotation({
        source: 'ai',
        label: 'breakout level',
        style: { color: '#A855F7', width: 2, dash: true },
      }),
    ];
    const res = await tsukiRequest('/api/annotations/NVDA.US', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ annotations }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { count: 1 } });
  });

  it('rejects a label longer than 120 chars, naming the id and field', async () => {
    const res = await tsukiRequest('/api/annotations/NVDA.US', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ annotations: [makeAnnotation({ label: 'x'.repeat(121) })] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('ann-1');
    expect(body.error).toContain('label');
  });

  it('rejects a style.color outside the preset palette, naming the id and field', async () => {
    const res = await tsukiRequest('/api/annotations/NVDA.US', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ annotations: [makeAnnotation({ style: { color: '#123456' } })] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('ann-1');
    expect(body.error).toContain('style.color');
  });

  it('rejects a style.width outside 1|2|3, naming the id and field', async () => {
    const res = await tsukiRequest('/api/annotations/NVDA.US', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ annotations: [makeAnnotation({ style: { width: 5 as 1 | 2 | 3 } })] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('ann-1');
    expect(body.error).toContain('style.width');
  });

  it('rejects a non-boolean style.dash, naming the id and field', async () => {
    const res = await tsukiRequest('/api/annotations/NVDA.US', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        annotations: [makeAnnotation({ style: { dash: 'yes' as unknown as boolean } })],
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('ann-1');
    expect(body.error).toContain('style.dash');
  });

  it('rejects a source outside user|ai, naming the id and field', async () => {
    const res = await tsukiRequest('/api/annotations/NVDA.US', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        annotations: [makeAnnotation({ source: 'bot' as Annotation['source'] })],
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('ann-1');
    expect(body.error).toContain('source');
  });

  it('still accepts a legacy annotation with no new fields', async () => {
    const res = await tsukiRequest('/api/annotations/NVDA.US', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ annotations: [makeAnnotation()] }),
    });
    expect(res.status).toBe(200);
  });

  it('accepts a polyline with 2 points', async () => {
    const res = await tsukiRequest('/api/annotations/NVDA.US', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        annotations: [
          makeAnnotation({
            kind: 'polyline',
            points: [
              { time: 1700000000, price: 100 },
              { time: 1700000100, price: 110 },
            ],
          }),
        ],
      }),
    });
    expect(res.status).toBe(200);
  });

  it('accepts a polyline with 20 points', async () => {
    const points = Array.from({ length: 20 }, (_, i) => ({
      time: 1700000000 + i * 100,
      price: 100 + i,
    }));
    const res = await tsukiRequest('/api/annotations/NVDA.US', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ annotations: [makeAnnotation({ kind: 'polyline', points })] }),
    });
    expect(res.status).toBe(200);
  });

  it('rejects a polyline with 1 point', async () => {
    const res = await tsukiRequest('/api/annotations/NVDA.US', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        annotations: [
          makeAnnotation({ kind: 'polyline', points: [{ time: 1700000000, price: 100 }] }),
        ],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects a polyline with 21 points', async () => {
    const points = Array.from({ length: 21 }, (_, i) => ({
      time: 1700000000 + i * 100,
      price: 100 + i,
    }));
    const res = await tsukiRequest('/api/annotations/NVDA.US', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ annotations: [makeAnnotation({ kind: 'polyline', points })] }),
    });
    expect(res.status).toBe(400);
  });

  it('accepts style.arrow true and false', async () => {
    for (const arrow of [true, false]) {
      const res = await tsukiRequest('/api/annotations/NVDA.US', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ annotations: [makeAnnotation({ style: { arrow } })] }),
      });
      expect(res.status).toBe(200);
    }
  });

  it('rejects a non-boolean style.arrow, naming the id and field', async () => {
    const res = await tsukiRequest('/api/annotations/NVDA.US', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        annotations: [makeAnnotation({ style: { arrow: 'yes' as unknown as boolean } })],
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('ann-1');
    expect(body.error).toContain('style.arrow');
  });
});

describe('GET /:symbol read error', () => {
  it('surfaces a 500 when the read fails for a reason other than a missing file', async () => {
    await mkdir(join(annotationsDir, 'NVDA.US.json'));
    const res = await tsukiRequest('/api/annotations/NVDA.US');
    expect(res.status).toBe(500);
  });
});

describe('symbol path traversal', () => {
  it('rejects a symbol with a path traversal attempt', async () => {
    const res = await tsukiRequest('/api/annotations/..%2Ffoo');
    expect(res.status).toBe(400);
  });
});
