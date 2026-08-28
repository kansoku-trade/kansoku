import { describe, expect, it, vi } from 'vitest';

vi.mock('electron-ipc-decorator', () => ({
  IpcMethod: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) =>
    descriptor,
  IpcService: class {},
}));

// Deliberately not mocking the core service: the point of these cases is that the
// desktop transport rejects the same input the HTTP route rejects, which only holds
// if both go through the shared normalizer.
const { EventsIpc } = await import('@desktop/kernel/ipc/eventsIpc.js');

describe('desktop events ipc', () => {
  it('registers under the events group', () => {
    expect(EventsIpc.groupName).toBe('events');
  });

  it('rejects a limit outside the allowed range', async () => {
    const instance = new EventsIpc();
    expect(await instance.list({ limit: 0 })).toMatchObject({ ok: false, status: 400 });
    expect(await instance.list({ limit: 100_000 })).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects a since that is not an ISO instant', async () => {
    const instance = new EventsIpc();
    expect(await instance.list({ since: 'yesterday' })).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects a symbol carrying a LIKE wildcard', async () => {
    const instance = new EventsIpc();
    expect(await instance.list({ symbol: '%' })).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects an unknown event class', async () => {
    const instance = new EventsIpc();
    expect(await instance.list({ class: 'nonsense' as never })).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it('rejects a beforeId with no before to anchor it', async () => {
    const instance = new EventsIpc();
    expect(await instance.list({ beforeId: 'abc' })).toMatchObject({ ok: false, status: 400 });
  });

  it('exposes generateCanvas on the same events group', () => {
    expect(typeof new EventsIpc().generateCanvas).toBe('function');
  });
});
