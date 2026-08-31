import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadCanvas, saveCanvas } from '../src/canvas/store.js';
import { createResearchService } from '../src/research/research.service.js';
import { createDb, type Db } from '../src/db/index.js';
import { createEventCanvasRuntime } from '../src/events/eventCanvas.js';
import { ingestEvent } from '../src/events/store.js';
import type { MarketEventDraft } from '../src/events/types.js';

const open: Db[] = [];
const dirs: string[] = [];

function db(): Db {
  const instance = createDb(':memory:');
  open.push(instance);
  return instance;
}

function temp(): string {
  const created = mkdtempSync(path.join(tmpdir(), 'kansoku-event-trace-'));
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

afterEach(() => {
  for (const instance of open.splice(0)) instance.$client.close();
  for (const created of dirs.splice(0)) rmSync(created, { recursive: true, force: true });
});

describe('event to canvas to research trace', () => {
  it('lets the research library find the originating event after a canvas save', async () => {
    const instance = db();
    const root = temp();
    const canvasDir = path.join(root, 'journal', 'canvases');
    const { event } = await ingestEvent(
      {
        source: 'sec-edgar',
        class: 'filing',
        kind: '8-K',
        symbols: ['MU.US'],
        occurredAt: '2026-08-20T14:00:00.000Z',
        observedAt: '2026-08-20T14:00:12.000Z',
        trust: 'official',
        severity: 'notable',
        payload: { title: 'Micron 8-K', url: 'https://sec.gov/mu-8k' },
      } satisfies MarketEventDraft,
      instance,
    );

    const runtime = createEventCanvasRuntime({
      db: instance,
      canvasDir,
      runner: async ({ slug, title }) => {
        await saveCanvas(canvasDir, { slug, title, source: SOURCE });
      },
      fetchKline: async () => [
        { time: '2026-08-20T13:55:00.000Z', open: 100, high: 101, low: 99, close: 100, volume: 10 },
        { time: '2026-08-20T14:05:00.000Z', open: 100, high: 102, low: 99, close: 101, volume: 20 },
      ],
      fetchFlow: async () => [],
      listComments: async () => [],
      listResearch: async () => [],
    });

    const job = await runtime.generate({ id: event.id });
    await job.done;

    const canvas = await loadCanvas(canvasDir, job.slug);
    expect(canvas?.origin).toEqual({ eventId: event.id, clusterId: event.clusterId });
    expect(canvas?.source).toContain('原消息与盘面');

    const listed = await createResearchService(root).list({ kind: 'canvas' });
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: `journal/canvases/${job.slug}.canvas.tsx`,
          origin: { eventId: event.id, clusterId: event.clusterId },
        }),
      ]),
    );
  });
});
