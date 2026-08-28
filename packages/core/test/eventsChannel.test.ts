import { rmSync } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { MarketEvent } from '@kansoku/shared/types';
import type { Connection } from '../src/realtime/connection.js';
import type { MarketEventDraft } from '../src/events/types.js';

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? '/tmp/';
  const sep = base.endsWith('/') ? '' : '/';
  return {
    dir: `${base}${sep}events-channel-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
});

vi.mock('../src/platform/env.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/platform/env.js')>('../src/platform/env.js');
  return {
    ...actual,
    get CHART_DATA_DIR() {
      return ctx.dir;
    },
  };
});

const { ingestEvent } = await import('../src/events/store.js');
const { handleConnection, parseWsMessage } = await import('../src/realtime/channelProtocol.js');

afterAll(() => {
  rmSync(ctx.dir, { recursive: true, force: true });
});

function makeConnection(): Connection & {
  sent: string[];
  emitMessage: (raw: string) => void;
  close: () => void;
} {
  const sent: string[] = [];
  let onMessage: ((raw: string) => void) | undefined;
  let onClose: (() => void) | undefined;
  return {
    sent,
    send: (text) => sent.push(text),
    onMessage: (cb) => {
      onMessage = cb;
    },
    onClose: (cb) => {
      onClose = cb;
    },
    emitMessage: (raw) => onMessage?.(raw),
    close: () => onClose?.(),
  };
}

async function waitFor(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('timed out waiting for condition');
}

let seq = 0;

function draft(overrides: Partial<MarketEventDraft> = {}): MarketEventDraft {
  seq += 1;
  return {
    source: 'sec-edgar',
    class: 'filing',
    kind: `form-4-${seq}`,
    symbols: ['NVDA.US'],
    occurredAt: '2026-08-20T13:00:00.000Z',
    observedAt: '2026-08-20T13:00:10.000Z',
    trust: 'official',
    severity: 'notable',
    payload: { title: `事件 ${seq}` },
    ...overrides,
  };
}

function payloads(conn: {
  sent: string[];
}): { type: string; event?: MarketEvent; events?: MarketEvent[] }[] {
  return conn.sent.map((raw) => JSON.parse(raw).payload);
}

describe('parseWsMessage events kind', () => {
  it('parses a subscription with no symbol filter', () => {
    expect(parseWsMessage({ op: 'sub', key: 'e1', kind: 'events' })).toEqual({
      op: 'sub',
      key: 'e1',
      kind: 'events',
    });
  });

  it('parses a symbol-scoped subscription', () => {
    expect(parseWsMessage({ op: 'sub', key: 'e1', kind: 'events', symbol: 'NVDA.US' })).toEqual({
      op: 'sub',
      key: 'e1',
      kind: 'events',
      symbol: 'NVDA.US',
    });
  });

  it('rejects an empty symbol rather than treating it as unfiltered', () => {
    expect(parseWsMessage({ op: 'sub', key: 'e1', kind: 'events', symbol: '' })).toBeNull();
  });
});

describe('events channel', () => {
  it('sends an init snapshot of stored events on the existing connection', async () => {
    const stored = await ingestEvent(draft({ payload: { title: '快照事件' } }));
    const conn = makeConnection();
    handleConnection(conn);
    conn.emitMessage(JSON.stringify({ op: 'sub', key: 'ev', kind: 'events' }));

    await waitFor(() => conn.sent.length > 0);
    const init = JSON.parse(conn.sent[0]);
    expect(init.key).toBe('ev');
    expect(init.payload.type).toBe('init');
    expect(init.payload.events.map((e: MarketEvent) => e.id)).toContain(stored.event.id);
    conn.close();
  });

  it('pushes a newly ingested event to a live subscriber', async () => {
    const conn = makeConnection();
    handleConnection(conn);
    conn.emitMessage(JSON.stringify({ op: 'sub', key: 'ev', kind: 'events' }));
    await waitFor(() => conn.sent.length > 0);
    conn.sent.length = 0;

    const { event } = await ingestEvent(draft({ payload: { title: '实时事件' } }));
    await waitFor(() => conn.sent.length > 0);
    expect(payloads(conn)).toEqual([{ type: 'event', event }]);
    conn.close();
  });

  it('does not push a re-ingest of the same event', async () => {
    const conn = makeConnection();
    handleConnection(conn);
    conn.emitMessage(JSON.stringify({ op: 'sub', key: 'ev', kind: 'events' }));
    await waitFor(() => conn.sent.length > 0);

    const repeated = draft({ payload: { title: '只该推一次' } });
    await ingestEvent(repeated);
    await waitFor(() => conn.sent.some((raw) => raw.includes('只该推一次')));
    conn.sent.length = 0;

    await ingestEvent(repeated);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(conn.sent).toHaveLength(0);
    conn.close();
  });

  it('delivers only matching events to a symbol-scoped subscriber', async () => {
    const conn = makeConnection();
    handleConnection(conn);
    conn.emitMessage(JSON.stringify({ op: 'sub', key: 'ev', kind: 'events', symbol: 'amd.us' }));
    await waitFor(() => conn.sent.length > 0);
    conn.sent.length = 0;

    await ingestEvent(draft({ symbols: ['NVDA.US'], payload: { title: '别的票' } }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(conn.sent).toHaveLength(0);

    const { event } = await ingestEvent(
      draft({ symbols: ['AMD.US'], payload: { title: '这只票' } }),
    );
    await waitFor(() => conn.sent.length > 0);
    expect(payloads(conn)).toEqual([{ type: 'event', event }]);
    conn.close();
  });

  it('stops delivering after unsubscribe', async () => {
    const conn = makeConnection();
    handleConnection(conn);
    conn.emitMessage(JSON.stringify({ op: 'sub', key: 'ev', kind: 'events' }));
    await waitFor(() => conn.sent.length > 0);
    conn.emitMessage(JSON.stringify({ op: 'unsub', key: 'ev' }));
    conn.sent.length = 0;

    await ingestEvent(draft({ payload: { title: '退订后' } }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(conn.sent).toHaveLength(0);
    conn.close();
  });

  it('pushes a re-clustered old event so a live subscriber can update it by id', async () => {
    const first = await ingestEvent(
      draft({
        symbols: ['MERGEA.US'],
        occurredAt: '2026-09-01T13:10:00.000Z',
        payload: { title: '簇 A' },
      }),
    );
    const second = await ingestEvent(
      draft({
        source: 'gdelt',
        symbols: ['MERGEB.US'],
        occurredAt: '2026-09-01T13:50:00.000Z',
        payload: { title: '簇 B' },
      }),
    );
    expect(second.event.clusterId).not.toBe(first.event.clusterId);

    const conn = makeConnection();
    handleConnection(conn);
    conn.emitMessage(JSON.stringify({ op: 'sub', key: 'ev', kind: 'events' }));
    await waitFor(() => conn.sent.length > 0);
    conn.sent.length = 0;

    const bridge = await ingestEvent(
      draft({
        source: 'fred',
        symbols: ['MERGEA.US', 'MERGEB.US'],
        occurredAt: '2026-09-01T13:30:00.000Z',
        payload: { title: '桥接' },
      }),
    );
    await waitFor(() => conn.sent.length >= 2);

    const pushed = payloads(conn).filter((p) => p.type === 'event');
    const updated = pushed.find((p) => p.event?.id === second.event.id);
    expect(updated?.event?.clusterId).toBe(bridge.event.clusterId);
    conn.close();
  });

  it('scopes the init snapshot to the subscribed symbol', async () => {
    await ingestEvent(draft({ symbols: ['TSLA.US'], payload: { title: 'TSLA 快照' } }));
    const conn = makeConnection();
    handleConnection(conn);
    conn.emitMessage(JSON.stringify({ op: 'sub', key: 'ev', kind: 'events', symbol: 'TSLA.US' }));
    await waitFor(() => conn.sent.length > 0);

    const init = JSON.parse(conn.sent[0]).payload;
    expect(init.events.length).toBeGreaterThan(0);
    for (const event of init.events as MarketEvent[]) {
      expect(event.symbols).toContain('TSLA.US');
    }
    conn.close();
  });

  it('pushes canvas generation progress on the same events channel', async () => {
    const { event } = await ingestEvent(draft({ symbols: ['CANVAS.US'] }));
    const conn = makeConnection();
    handleConnection(conn);
    conn.emitMessage(JSON.stringify({ op: 'sub', key: 'ev', kind: 'events' }));
    await waitFor(() => conn.sent.length > 0);
    conn.sent.length = 0;

    const { publishEventCanvasProgress } = await import('../src/events/canvasProgress.js');
    publishEventCanvasProgress({
      eventId: event.id,
      clusterId: event.clusterId,
      slug: `event-${event.id}`,
      symbols: event.symbols,
      phase: 'running',
      error: null,
    });
    await waitFor(() => conn.sent.length > 0);
    expect(JSON.parse(conn.sent[0]).payload).toMatchObject({
      type: 'canvas',
      eventId: event.id,
      phase: 'running',
      slug: `event-${event.id}`,
    });
    conn.close();
  });
});
