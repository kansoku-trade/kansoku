import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canSaveCanvas, canvasQuotaMessage, FREE_CANVAS_LIMIT } from '../src/canvas/quota.js';
import { createCanvasService } from '../src/canvas/canvas.service.js';
import { buildCanvasTools } from '../src/canvas/tools.js';
import { saveCanvas } from '../src/canvas/store.js';
import { ClientError } from '../src/platform/errors.js';

const source = `import { Canvas, Text } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="Demo" caption="Longbridge · demo"><Text>ok</Text></Canvas>;
}
`;

function dir(): string {
  return mkdtempSync(join(tmpdir(), 'canvas-quota-'));
}

function textOf(result: { content: { type: string; text?: string }[] }): string {
  return (result.content[0] as { text: string }).text;
}

describe('canSaveCanvas', () => {
  it('lets a licensed save create past the free limit', () => {
    expect(
      canSaveCanvas({ licensed: true, replacing: false, count: FREE_CANVAS_LIMIT }),
    ).toBe(true);
  });

  it('lets an unlicensed save overwrite an existing slug at the limit', () => {
    expect(
      canSaveCanvas({ licensed: false, replacing: true, count: FREE_CANVAS_LIMIT }),
    ).toBe(true);
  });

  it('blocks an unlicensed new slug at the limit', () => {
    expect(
      canSaveCanvas({ licensed: false, replacing: false, count: FREE_CANVAS_LIMIT }),
    ).toBe(false);
  });

  it('allows an unlicensed new slug under the limit', () => {
    expect(canSaveCanvas({ licensed: false, replacing: false, count: 2 })).toBe(true);
  });
});

describe('canvasQuotaMessage', () => {
  it('names the free cap and the Pro unlock', () => {
    expect(canvasQuotaMessage()).toContain('3');
    expect(canvasQuotaMessage()).toMatch(/Pro/);
  });
});

describe('save_canvas quota', () => {
  it('refuses a fourth new slug when unlicensed and still allows overwrite', async () => {
    const root = dir();
    const byName = Object.fromEntries(
      buildCanvasTools(root, { licensed: () => false }).map((tool) => [tool.name, tool]),
    );

    for (const slug of ['one', 'two', 'three']) {
      expect(
        textOf(await byName.save_canvas.execute(slug, { slug, title: slug, source })),
      ).toContain(`saved slug=${slug}`);
    }

    const refused = textOf(
      await byName.save_canvas.execute('four', { slug: 'four', title: 'four', source }),
    );
    expect(refused.startsWith('rejected:')).toBe(true);
    expect(refused).toContain('3');

    expect(
      textOf(await byName.save_canvas.execute('two', { slug: 'two', title: 'two-updated', source })),
    ).toContain('saved slug=two');
  });

  it('saves a fourth slug when licensed', async () => {
    const root = dir();
    const byName = Object.fromEntries(
      buildCanvasTools(root, { licensed: () => true }).map((tool) => [tool.name, tool]),
    );
    for (const slug of ['one', 'two', 'three']) {
      await byName.save_canvas.execute(slug, { slug, title: slug, source });
    }
    expect(
      textOf(await byName.save_canvas.execute('four', { slug: 'four', title: 'four', source })),
    ).toContain('saved slug=four');
  });
});

describe('canvas service quota', () => {
  it('throws LICENSE_REQUIRED on a fourth new slug when unlicensed', async () => {
    const canvas = createCanvasService(dir(), { licensed: () => false });
    await canvas.save({ slug: 'one', title: 'one', source });
    await canvas.save({ slug: 'two', title: 'two', source });
    await canvas.save({ slug: 'three', title: 'three', source });

    const err = await canvas.save({ slug: 'four', title: 'four', source }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ClientError);
    expect(err).toMatchObject({ status: 403, code: 'LICENSE_REQUIRED' });
  });
});

describe('event canvas quota', () => {
  it('does not consume a slot when the event slug already exists', async () => {
    const root = dir();
    await saveCanvas(root, { slug: 'one', title: 'one', source });
    await saveCanvas(root, { slug: 'two', title: 'two', source });
    await saveCanvas(root, { slug: 'event-abc', title: 'event', source });
    expect(
      canSaveCanvas({
        licensed: false,
        replacing: true,
        count: 3,
      }),
    ).toBe(true);
  });
});
