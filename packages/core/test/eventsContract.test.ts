import { rmSync } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { MarketEventDraft } from '../src/events/types.js';

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? '/tmp/';
  const sep = base.endsWith('/') ? '' : '/';
  return {
    dir: `${base}${sep}events-contract-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

const { allRoutes, eventsRoutes } = await import('../src/contract/index.js');
const { eventsService } = await import('../src/events/events.service.js');
const { ingestEvent, saveSourceState } = await import('../src/events/store.js');

afterAll(() => {
  rmSync(ctx.dir, { recursive: true, force: true });
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

describe('events route table', () => {
  it('is registered in the app contract under its own group', () => {
    expect(allRoutes.events).toBe(eventsRoutes);
    expect(eventsRoutes.group).toBe('events');
  });

  it('exposes list, get, and source health as GET routes', () => {
    expect(eventsRoutes.routes.list).toEqual({ method: 'GET', path: '/' });
    expect(eventsRoutes.routes.get).toEqual({ method: 'GET', path: '/:id' });
    expect(eventsRoutes.routes.sourceHealth).toEqual({ method: 'GET', path: '/sources/health' });
  });
});

describe('eventsService.list', () => {
  it('returns stored events newest first', async () => {
    const older = await ingestEvent(draft({ occurredAt: '2026-08-19T13:00:00.000Z' }));
    const newer = await ingestEvent(draft({ occurredAt: '2026-08-21T13:00:00.000Z' }));
    const ids = (await eventsService.list({})).map((e) => e.id);
    expect(ids.indexOf(newer.event.id)).toBeLessThan(ids.indexOf(older.event.id));
  });

  it('filters by symbol', async () => {
    const { event } = await ingestEvent(draft({ symbols: ['CRWD.US'] }));
    const list = await eventsService.list({ symbol: 'crwd.us' });
    expect(list.map((e) => e.id)).toEqual([event.id]);
  });

  it('honors the limit', async () => {
    await ingestEvent(draft());
    await ingestEvent(draft());
    expect(await eventsService.list({ limit: 1 })).toHaveLength(1);
  });
});

describe('eventsService.get', () => {
  it('returns the stored event', async () => {
    const { event } = await ingestEvent(draft());
    expect(await eventsService.get({ id: event.id })).toEqual(event);
  });

  it('rejects an unknown id with a 404 client error', async () => {
    await expect(eventsService.get({ id: 'missing' })).rejects.toMatchObject({
      name: 'ClientError',
      status: 404,
    });
  });
});

describe('eventsService.sourceHealth', () => {
  it('reports every known source with its health', async () => {
    await saveSourceState({ source: 'gdelt', health: 'degraded', failureStreak: 3 });
    const health = await eventsService.sourceHealth();
    expect(health.find((s) => s.source === 'gdelt')).toMatchObject({
      health: 'degraded',
      failureStreak: 3,
    });
  });
});
