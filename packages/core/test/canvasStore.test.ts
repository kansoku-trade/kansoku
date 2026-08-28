import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadCanvas, saveCanvas, setCanvasOrigin } from '../src/canvas/store.js';

const dirs: string[] = [];

function dir(): string {
  const created = mkdtempSync(path.join(tmpdir(), 'kansoku-canvas-'));
  dirs.push(created);
  return created;
}

const SOURCE = `import { Canvas, Section, Text } from '@kansoku/canvas';

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
