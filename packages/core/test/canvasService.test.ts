import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCanvasService } from '../src/canvas/canvas.service.js';
import { ClientError } from '../src/platform/errors.js';

const source = `import { Canvas, Text } from '@kansoku/canvas';
export default function App() {
  return <Canvas title="Demo" caption="Longbridge · demo"><Text>ok</Text></Canvas>;
}
`;

function service() {
  return createCanvasService(mkdtempSync(join(tmpdir(), 'canvas-svc-')));
}

describe('createCanvasService', () => {
  it('saves then gets a canvas', async () => {
    const canvas = service();
    const saved = await canvas.save({ slug: 'mu-demo', title: 'MU demo', source });
    expect(saved.slug).toBe('mu-demo');
    const got = await canvas.get({ slug: 'mu-demo' });
    expect(got.source).toBe(source);
    expect(got.check).toBeNull();
  });

  it('records a compile check that get returns', async () => {
    const canvas = service();
    await canvas.save({ slug: 'mu-demo', title: 'MU demo', source });
    const updated = await canvas.recordCheck({
      slug: 'mu-demo',
      issues: ['Unexpected token'],
      stage: 'compile',
    });
    expect(updated.check?.stage).toBe('compile');
    expect(updated.check?.issues).toEqual(['Unexpected token']);
    const got = await canvas.get({ slug: 'mu-demo' });
    expect(got.check?.issues).toEqual(['Unexpected token']);
  });

  it('throws 404 for a missing canvas', async () => {
    const canvas = service();
    await expect(canvas.get({ slug: 'missing' })).rejects.toMatchObject({
      name: 'ClientError',
      status: 404,
    } satisfies Partial<ClientError>);
  });

  it('throws 400 when source fails the static check', async () => {
    const canvas = service();
    await expect(
      canvas.save({ slug: 'bad', title: 'bad', source: 'export function App() { return null; }\n' }),
    ).rejects.toMatchObject({ status: 400 } satisfies Partial<ClientError>);
  });

  it('lists saved canvases', async () => {
    const canvas = service();
    await canvas.save({ slug: 'alpha', title: 'Alpha', source });
    const listed = await canvas.list();
    expect(listed).toEqual([expect.objectContaining({ slug: 'alpha', title: 'Alpha' })]);
  });
});
