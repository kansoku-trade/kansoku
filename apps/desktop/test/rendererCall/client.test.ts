import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RendererCallRequest } from '@desktop/platform/rendererCall/channels.js';

type Handler = (event: unknown, payload: unknown) => void;

const onHandlers = new Map<string, Handler>();
const ipcMain = {
  on: vi.fn((channel: string, handler: Handler) => {
    onHandlers.set(channel, handler);
  }),
};

vi.mock('electron', () => ({ ipcMain }));

const { createRendererCallClient, RendererCallTimeoutError } =
  await import('@desktop/platform/rendererCall/client.js');
const { RENDERER_CALL_REQUEST_CHANNEL, RENDERER_CALL_RESPONSE_CHANNEL } =
  await import('@desktop/platform/rendererCall/channels.js');

class FakeWindow {
  webContents = { send: vi.fn() };
}

function lastRequest(win: FakeWindow): RendererCallRequest {
  const calls = win.webContents.send.mock.calls;
  const [channel, request] = calls.at(-1) as [string, RendererCallRequest];
  expect(channel).toBe(RENDERER_CALL_REQUEST_CHANNEL);
  return request;
}

function respond(payload: unknown): void {
  onHandlers.get(RENDERER_CALL_RESPONSE_CHANNEL)?.({}, payload);
}

describe('createRendererCallClient', () => {
  beforeEach(() => {
    onHandlers.clear();
    ipcMain.on.mockClear();
  });

  it('sends the request to the window and resolves with the matching response', async () => {
    const client = createRendererCallClient();
    const win = new FakeWindow();

    const promise = client.call(win as never, 'tabs.getActiveTabId', { extra: 1 });
    const request = lastRequest(win);
    expect(request.method).toBe('tabs.getActiveTabId');
    expect(request.args).toEqual({ extra: 1 });

    respond({ id: request.id, ok: true, result: 'tab-9' });
    await expect(promise).resolves.toBe('tab-9');
  });

  it('rejects when the renderer reports a failure', async () => {
    const client = createRendererCallClient();
    const win = new FakeWindow();

    const promise = client.call(win as never, 'tabs.setActive', { id: 'x' });
    respond({ id: lastRequest(win).id, ok: false, error: 'no handler for tabs.setActive' });

    await expect(promise).rejects.toThrow('no handler for tabs.setActive');
  });

  it('ignores responses with unknown or missing ids', async () => {
    const client = createRendererCallClient();
    const win = new FakeWindow();

    const promise = client.call(win as never, 'tabs.getActiveTabId');
    respond({ id: 'someone-else', ok: true, result: 'wrong' });
    respond({ ok: true, result: 'also wrong' });
    respond(null);

    respond({ id: lastRequest(win).id, ok: true, result: 'tab-1' });
    await expect(promise).resolves.toBe('tab-1');
  });

  it('rejects with a timeout error when no response arrives, then ignores late responses', async () => {
    const client = createRendererCallClient();
    const win = new FakeWindow();

    const promise = client.call(win as never, 'tabs.getActiveTabId', undefined, 10);
    await expect(promise).rejects.toBeInstanceOf(RendererCallTimeoutError);

    respond({ id: lastRequest(win).id, ok: true, result: 'late' });
  });

  it('keeps concurrent calls separate by id', async () => {
    const client = createRendererCallClient();
    const win = new FakeWindow();

    const first = client.call(win as never, 'a');
    const firstId = lastRequest(win).id;
    const second = client.call(win as never, 'b');
    const secondId = lastRequest(win).id;

    respond({ id: secondId, ok: true, result: 'B' });
    respond({ id: firstId, ok: true, result: 'A' });

    await expect(first).resolves.toBe('A');
    await expect(second).resolves.toBe('B');
  });
});
