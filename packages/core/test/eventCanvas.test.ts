import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadCanvas, saveCanvas } from '../src/canvas/store.js';
import { createDb, type Db } from '../src/db/index.js';
import { onEventCanvasProgress } from '../src/events/canvasProgress.js';
import {
  createEventCanvasRuntime,
  type EventCanvasRunner,
} from '../src/events/eventCanvas.js';
import { eventCanvasSlug } from '../src/events/eventCanvasSlug.js';
import { getEvent, ingestEvent } from '../src/events/store.js';
import type { MarketEventDraft } from '../src/events/types.js';

const open: Db[] = [];
const dirs: string[] = [];

function db(): Db {
  const instance = createDb(':memory:');
  open.push(instance);
  return instance;
}

function canvasDir(): string {
  const created = mkdtempSync(path.join(tmpdir(), 'kansoku-event-canvas-'));
  dirs.push(created);
  return created;
}

const SOURCE = `import { Canvas, Section, Text } from '@kansoku/canvas';

export default function App() {
  return (
    <Canvas title="事件画布" caption="Longbridge · demo">
      <Section title="证据">
        <Text>原消息与盘面</Text>
      </Section>
    </Canvas>
  );
}
`;

function draft(overrides: Partial<MarketEventDraft> = {}): MarketEventDraft {
  return {
    source: 'sec-edgar',
    class: 'filing',
    kind: '8-K',
    symbols: ['MU.US'],
    occurredAt: '2026-08-20T14:00:00.000Z',
    observedAt: '2026-08-20T14:00:12.000Z',
    trust: 'official',
    severity: 'notable',
    payload: { title: 'Micron 8-K', url: 'https://sec.gov/mu-8k' },
    ...overrides,
  };
}

afterEach(() => {
  for (const instance of open.splice(0)) instance.$client.close();
  for (const created of dirs.splice(0)) rmSync(created, { recursive: true, force: true });
});

describe('generateEventCanvas', () => {
  it('runs only after a click, writes the event slug, and traces origin', async () => {
    const instance = db();
    const dir = canvasDir();
    const { event } = await ingestEvent(draft(), instance);
    const phases: string[] = [];
    const unsub = onEventCanvasProgress((progress) => {
      if (progress.eventId === event.id) phases.push(progress.phase);
    });

    const runner: EventCanvasRunner = async ({ pack, slug, canvasDir }) => {
      expect(pack.event.id).toBe(event.id);
      expect(slug).toBe(eventCanvasSlug(event.id));
      const saved = await saveCanvas(canvasDir, {
        slug,
        title: pack.event.payload.title,
        source: SOURCE,
      });
      expect(saved.ok).toBe(true);
    };

    const runtime = createEventCanvasRuntime({
      db: instance,
      canvasDir: dir,
      runner,
      fetchKline: async () => [],
      fetchFlow: async () => [],
      listComments: async () => [],
      listResearch: async () => [],
    });

    const queued = await runtime.generate({ id: event.id });
    expect(queued.phase).toBe('queued');
    expect(queued.slug).toBe(eventCanvasSlug(event.id));
    await queued.done;

    unsub();
    expect(phases).toEqual(['queued', 'running', 'done']);

    const stored = await getEvent(event.id, instance);
    expect(stored?.canvasSlug).toBe(queued.slug);

    const doc = await loadCanvas(dir, queued.slug);
    expect(doc?.origin).toEqual({ eventId: event.id, clusterId: event.clusterId });
    expect(doc?.source).toContain('原消息与盘面');
  });

  it('overwrites the same slug on retry', async () => {
    const instance = db();
    const dir = canvasDir();
    const { event } = await ingestEvent(draft(), instance);
    let writes = 0;
    const runtime = createEventCanvasRuntime({
      db: instance,
      canvasDir: dir,
      runner: async ({ slug, canvasDir, pack }) => {
        writes += 1;
        await saveCanvas(canvasDir, {
          slug,
          title: pack.event.payload.title,
          source: SOURCE.replace('原消息与盘面', `第 ${writes} 稿`),
        });
      },
      fetchKline: async () => [],
      fetchFlow: async () => [],
      listComments: async () => [],
      listResearch: async () => [],
    });

    const first = await runtime.generate({ id: event.id });
    await first.done;
    const second = await runtime.generate({ id: event.id });
    await second.done;
    expect(second.slug).toBe(first.slug);
    expect(writes).toBe(2);
    expect((await loadCanvas(dir, first.slug))?.source).toContain('第 2 稿');
  });

  it('does not start a second run while one is already in flight', async () => {
    const instance = db();
    const dir = canvasDir();
    const { event } = await ingestEvent(draft(), instance);
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runtime = createEventCanvasRuntime({
      db: instance,
      canvasDir: dir,
      runner: async ({ slug, canvasDir, pack }) => {
        started += 1;
        await gate;
        await saveCanvas(canvasDir, {
          slug,
          title: pack.event.payload.title,
          source: SOURCE,
        });
      },
      fetchKline: async () => [],
      fetchFlow: async () => [],
      listComments: async () => [],
      listResearch: async () => [],
    });

    const first = await runtime.generate({ id: event.id });
    const second = await runtime.generate({ id: event.id });
    expect(['queued', 'running']).toContain(second.phase);
    expect(second.slug).toBe(first.slug);
    release();
    await first.done;
    await second.done;
    expect(started).toBe(1);
  });

  it('broadcasts failed and allows a later retry', async () => {
    const instance = db();
    const dir = canvasDir();
    const { event } = await ingestEvent(draft(), instance);
    let attempts = 0;
    const phases: string[] = [];
    const unsub = onEventCanvasProgress((progress) => {
      if (progress.eventId === event.id) phases.push(progress.phase);
    });
    const runtime = createEventCanvasRuntime({
      db: instance,
      canvasDir: dir,
      runner: async ({ slug, canvasDir, pack }) => {
        attempts += 1;
        if (attempts === 1) throw new Error('model refused');
        await saveCanvas(canvasDir, {
          slug,
          title: pack.event.payload.title,
          source: SOURCE,
        });
      },
      fetchKline: async () => [],
      fetchFlow: async () => [],
      listComments: async () => [],
      listResearch: async () => [],
    });

    const failed = await runtime.generate({ id: event.id });
    await expect(failed.done).rejects.toThrow(/model refused/);
    expect(phases.at(-1)).toBe('failed');

    const retry = await runtime.generate({ id: event.id });
    await retry.done;
    unsub();
    expect(attempts).toBe(2);
    expect(phases.at(-1)).toBe('done');
  });

  it('refuses a new event canvas when the free quota is full', async () => {
    const instance = db();
    const dir = canvasDir();
    const { event } = await ingestEvent(draft(), instance);
    let called = 0;
    for (const slug of ['one', 'two', 'three']) {
      await saveCanvas(dir, { slug, title: slug, source: SOURCE });
    }
    const runtime = createEventCanvasRuntime({
      db: instance,
      canvasDir: dir,
      licensed: () => false,
      runner: async () => {
        called += 1;
      },
      fetchKline: async () => [],
      fetchFlow: async () => [],
      listComments: async () => [],
      listResearch: async () => [],
    });
    await expect(runtime.generate({ id: event.id })).rejects.toMatchObject({
      status: 403,
      code: 'LICENSE_REQUIRED',
    });
    expect(called).toBe(0);
  });

  it('rejects an unknown event without calling the persona', async () => {
    let called = 0;
    const runtime = createEventCanvasRuntime({
      db: db(),
      canvasDir: canvasDir(),
      runner: async () => {
        called += 1;
      },
      fetchKline: async () => [],
      fetchFlow: async () => [],
      listComments: async () => [],
      listResearch: async () => [],
    });
    await expect(runtime.generate({ id: 'missing' })).rejects.toThrow(/not found/);
    expect(called).toBe(0);
  });
});
