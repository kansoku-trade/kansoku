import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? '/tmp/';
  const sep = base.endsWith('/') ? '' : '/';
  return { dir: `${base}${sep}kansoku-host-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}` };
});

vi.mock('@kansoku/core/platform/env', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  CHART_DATA_DIR: ctx.dir,
}));

vi.mock('@kansoku/core/ai/personas/comments', () => ({
  onComment: vi.fn(() => () => {}),
  listComments: vi.fn(async () => []),
  appendComment: vi.fn(),
}));
vi.mock('@kansoku/core/ai/chat/chat', () => ({
  onChatEvent: vi.fn(),
  chatTurnState: vi.fn(),
}));
vi.mock('@kansoku/core/realtime/analyses', () => ({ subscribeAnalyses: vi.fn(() => () => {}) }));
vi.mock('@kansoku/core/realtime/benchmark', () => ({ subscribeBenchmark: vi.fn(() => () => {}) }));
vi.mock('@kansoku/core/realtime/board', () => ({
  subscribeBoard: vi.fn((push: (envelope: string) => void) => {
    push(JSON.stringify({ type: 'board', value: 1 }));
    return () => {};
  }),
}));
vi.mock('@kansoku/core/realtime/charts', () => ({ subscribeChart: vi.fn(() => () => {}) }));
vi.mock('@kansoku/core/realtime/position', () => ({ subscribePosition: vi.fn(() => () => {}) }));
vi.mock('@kansoku/core/realtime/quotes', () => ({ subscribeQuotes: vi.fn(() => () => {}) }));

const { CHART_DATA_DIR, PORT, WEB_DIST } = await import('@kansoku/core/platform/env');
const { startHost } = await import('../src/host.js');

describe('host smoke', () => {
  let server: Server;
  let baseUrl: string;
  let wsUrl: string;

  beforeAll(async () => {
    const handle = await startHost(0, false);
    server = handle.server;
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    wsUrl = `ws://127.0.0.1:${port}/api/ws`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/health returns the exact envelope', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: { status: 'up', port: PORT, dataDir: CHART_DATA_DIR },
    });
  });

  it('does not read the repo journal chart dir', () => {
    expect(CHART_DATA_DIR).toBe(ctx.dir);
  });

  it('GET /api/charts returns the list envelope', async () => {
    const res = await fetch(`${baseUrl}/api/charts`);
    const body = (await res.json()) as { ok?: boolean; data?: unknown; error?: string };
    expect({ status: res.status, ok: body.ok, dataIsArray: Array.isArray(body.data), error: body.error }).toEqual({
      status: 200,
      ok: true,
      dataIsArray: true,
      error: undefined,
    });
  });

  it("GET /api/nope hits the kernel's unmatched-route fallback", async () => {
    const res = await fetch(`${baseUrl}/api/nope`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('404 Not Found');
  });

  it('round-trips one WS sub over a real socket then closes cleanly', async () => {
    const client = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      client.on('open', resolve);
      client.on('error', reject);
    });

    const received: string[] = [];
    client.on('message', (data) => received.push(String(data)));
    client.send(JSON.stringify({ op: 'sub', key: 'b1', kind: 'board' }));

    await vi.waitFor(() => {
      if (received.length === 0) throw new Error('no message yet');
    });
    expect(JSON.parse(received[0])).toEqual({ key: 'b1', payload: { type: 'board', value: 1 } });

    await new Promise<void>((resolve) => {
      client.on('close', () => resolve());
      client.close();
    });
  });

  it('GET / stays up (serves web dist when present, else API-only)', async () => {
    const res = await fetch(`${baseUrl}/`);
    if (existsSync(WEB_DIST)) {
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
    } else {
      expect(res.status).not.toBe(500);
    }
  });
});
