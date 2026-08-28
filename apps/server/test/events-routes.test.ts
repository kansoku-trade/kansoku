import { rmSync } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { MarketEvent } from '@kansoku/shared/types';
import { tsukiRequest } from './helpers.js';

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? '/tmp/';
  const sep = base.endsWith('/') ? '' : '/';
  const dir = `${base}${sep}events-routes-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { dir };
});

vi.mock('@kansoku/core/platform/env', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  CHART_DATA_DIR: ctx.dir,
}));

const { ingestEvent, saveSourceState } = await import('@kansoku/core/events/store');
const { configureEventCanvasRuntime, createEventCanvasRuntime } = await import(
  '@kansoku/core/events/eventCanvas'
);
const { saveCanvas } = await import('@kansoku/core/canvas/store');
const { onEventCanvasProgress } = await import('@kansoku/core/events/canvasProgress');

type MarketEventDraft = import('@kansoku/core/events/types').MarketEventDraft;

afterAll(() => {
  rmSync(ctx.dir, { recursive: true, force: true });
  configureEventCanvasRuntime(null);
});

let seq = 0;

function draft(overrides: Partial<MarketEventDraft> = {}): MarketEventDraft {
  seq += 1;
  return {
    source: 'sec-edgar',
    class: 'filing',
    kind: `form-4-${seq}`,
    symbols: ['NVDA.US'],
    occurredAt: `2026-08-20T13:0${seq}:00.000Z`,
    observedAt: '2026-08-20T13:10:00.000Z',
    trust: 'official',
    severity: 'notable',
    payload: { title: `事件 ${seq}` },
    ...overrides,
  };
}

describe('GET /api/events', () => {
  it('lists stored events', async () => {
    const { event } = await ingestEvent(draft());
    const res = await tsukiRequest('/api/events');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.map((e: MarketEvent) => e.id)).toContain(event.id);
  });

  it('filters by symbol', async () => {
    const { event } = await ingestEvent(draft({ symbols: ['PLTR.US'] }));
    const res = await tsukiRequest('/api/events?symbol=PLTR.US');
    const body = await res.json();
    expect(body.data.map((e: MarketEvent) => e.id)).toEqual([event.id]);
  });

  it('filters by class and rejects an unknown class', async () => {
    await ingestEvent(draft({ class: 'macro', source: 'fred', symbols: [] }));
    const ok = await tsukiRequest('/api/events?class=macro');
    expect(ok.status).toBe(200);
    expect((await ok.json()).data.every((e: MarketEvent) => e.class === 'macro')).toBe(true);

    const bad = await tsukiRequest('/api/events?class=nonsense');
    expect(bad.status).toBe(400);
  });

  it('honors the limit and rejects a non-numeric one', async () => {
    await ingestEvent(draft());
    await ingestEvent(draft());
    const res = await tsukiRequest('/api/events?limit=1');
    expect((await res.json()).data).toHaveLength(1);

    const bad = await tsukiRequest('/api/events?limit=many');
    expect(bad.status).toBe(400);
  });

  it('rejects a limit that would dump the whole table', async () => {
    const res = await tsukiRequest('/api/events?limit=100000');
    expect(res.status).toBe(400);
  });

  it('filters by source', async () => {
    const { event } = await ingestEvent(draft({ source: 'gdelt', symbols: ['SNOW.US'] }));
    const res = await tsukiRequest('/api/events?source=gdelt');
    const body = await res.json();
    expect(body.data.map((e: MarketEvent) => e.id)).toContain(event.id);
    expect(body.data.every((e: MarketEvent) => e.source === 'gdelt')).toBe(true);
  });

  it('honors since and rejects a time that is not an ISO instant', async () => {
    await ingestEvent(draft({ symbols: ['SINCE.US'], occurredAt: '2026-08-19T10:00:00.000Z' }));
    const fresh = await ingestEvent(
      draft({ symbols: ['SINCE.US'], occurredAt: '2026-08-21T10:00:00.000Z' }),
    );
    const res = await tsukiRequest(
      '/api/events?symbol=SINCE.US&since=2026-08-20T00%3A00%3A00.000Z',
    );
    expect((await res.json()).data.map((e: MarketEvent) => e.id)).toEqual([fresh.event.id]);

    for (const bad of ['yesterday', '2026-08-20']) {
      expect((await tsukiRequest(`/api/events?since=${bad}`)).status).toBe(400);
      expect((await tsukiRequest(`/api/events?before=${bad}`)).status).toBe(400);
    }
  });

  it('normalizes a bare ticker the same way the rest of the app does', async () => {
    const { event } = await ingestEvent(draft({ symbols: ['MU.US'] }));
    const res = await tsukiRequest('/api/events?symbol=mu');
    expect(res.status).toBe(200);
    expect((await res.json()).data.map((e: MarketEvent) => e.id)).toContain(event.id);
  });

  it('rejects a symbol carrying a LIKE wildcard instead of matching everything', async () => {
    expect((await tsukiRequest('/api/events?symbol=%25')).status).toBe(400);
    expect((await tsukiRequest('/api/events?symbol=_VDA.US')).status).toBe(400);
  });

  it('pages with before and beforeId across events sharing one timestamp', async () => {
    const at = '2026-08-22T10:00:00.000Z';
    for (let i = 0; i < 3; i += 1) {
      await ingestEvent(draft({ symbols: ['PAGE.US'], occurredAt: at }));
    }
    const first = await (await tsukiRequest('/api/events?symbol=PAGE.US&limit=2')).json();
    expect(first.data).toHaveLength(2);

    const cursor = first.data[1] as MarketEvent;
    const next = await tsukiRequest(
      `/api/events?symbol=PAGE.US&limit=2&before=${encodeURIComponent(cursor.occurredAt)}&beforeId=${cursor.id}`,
    );
    const second = await next.json();
    expect(second.data).toHaveLength(1);
    const ids = [...first.data, ...second.data].map((e: MarketEvent) => e.id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('GET /api/events/:id', () => {
  it('returns one event', async () => {
    const { event } = await ingestEvent(draft());
    const res = await tsukiRequest(`/api/events/${event.id}`);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(event);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await tsukiRequest('/api/events/does-not-exist');
    expect(res.status).toBe(404);
    expect((await res.json()).ok).toBe(false);
  });
});

describe('GET /api/events/sources/health', () => {
  it('is not shadowed by the :id route and reports per-source health', async () => {
    await saveSourceState({ source: 'gdelt', health: 'degraded', failureStreak: 2 });
    const res = await tsukiRequest('/api/events/sources/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.find((s: { source: string }) => s.source === 'gdelt')).toMatchObject({
      health: 'degraded',
      failureStreak: 2,
    });
  });
});

const CANVAS_SOURCE = `import { Canvas, Section, Text } from '@kansoku/canvas';

export default function App() {
  return (
    <Canvas title="事件画布">
      <Section title="证据">
        <Text>原消息</Text>
      </Section>
    </Canvas>
  );
}
`;

describe('POST /api/events/:id/canvas', () => {
  it('queues generation and returns the bound slug', async () => {
    const { event } = await ingestEvent(draft({ symbols: ['ROUTE.US'] }));
    configureEventCanvasRuntime(
      createEventCanvasRuntime({
        canvasDir: ctx.dir,
        runner: async ({ slug, title, canvasDir }) => {
          await saveCanvas(canvasDir, { slug, title, source: CANVAS_SOURCE });
        },
        fetchKline: async () => [],
        fetchFlow: async () => [],
        listComments: async () => [],
        listResearch: async () => [],
      }),
    );
    const finished = new Promise<void>((resolve, reject) => {
      const unsub = onEventCanvasProgress((progress) => {
        if (progress.eventId !== event.id) return;
        if (progress.phase === 'done') {
          unsub();
          resolve();
        }
        if (progress.phase === 'failed') {
          unsub();
          reject(new Error(progress.error ?? 'generation failed'));
        }
      });
    });
    const res = await tsukiRequest(`/api/events/${event.id}/canvas`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.slug).toBe(`event-${event.id}`);
    expect(['queued', 'running', 'done']).toContain(body.data.phase);
    await finished;
  });

  it('returns 404 for an unknown event', async () => {
    const res = await tsukiRequest('/api/events/does-not-exist/canvas', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
