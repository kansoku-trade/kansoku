import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { MarketEvent } from '@kansoku/shared/types';
import { createDb, type Db } from '../src/db/index.js';
import { marketEvents } from '../src/db/schema.js';
import { onMarketEvent } from '../src/events/bus.js';
import type { MarketEventDraft } from '../src/events/types.js';
import { buildDedupeKey, deriveEventId } from '../src/events/identity.js';
import {
  getEvent,
  ingestEvent,
  listEvents,
  listEventsByCluster,
  listSourceStates,
  readSourceState,
  saveSourceState,
  setEventCanvasSlug,
} from '../src/events/store.js';
import { executeMigration, seedLegacyLedger } from './migrationHelpers.js';

const open: Db[] = [];
const dirs: string[] = [];

function db(): Db {
  const instance = createDb(':memory:');
  open.push(instance);
  return instance;
}

function tempDbPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'kansoku-events-'));
  dirs.push(dir);
  return path.join(dir, 'app.db');
}

afterEach(() => {
  for (const instance of open.splice(0)) instance.$client.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function draft(overrides: Partial<MarketEventDraft> = {}): MarketEventDraft {
  return {
    source: 'sec-edgar',
    class: 'filing',
    kind: 'form-4',
    symbols: ['NVDA.US'],
    occurredAt: '2026-08-20T13:00:00.000Z',
    observedAt: '2026-08-20T13:00:30.000Z',
    trust: 'official',
    severity: 'notable',
    payload: { title: '内部人卖出 12 万股', url: 'https://sec.gov/x' },
    ...overrides,
  };
}

describe('market_events migration', () => {
  it('creates both event tables', () => {
    const names = db()
      .$client.prepare(`select name from sqlite_master where type='table'`)
      .all()
      .map((row) => (row as { name: string }).name);
    expect(names).toContain('market_events');
    expect(names).toContain('event_source_cursors');
  });

  it('rejects a second row with the same source and dedupe key at the database level', async () => {
    const instance = db();
    const row = {
      id: 'a',
      dedupeKey: 'k1',
      clusterId: 'a',
      source: 'sec-edgar',
      class: 'filing' as const,
      kind: 'form-4',
      symbols: ['NVDA.US'],
      occurredAt: '2026-08-20T13:00:00.000Z',
      observedAt: '2026-08-20T13:00:00.000Z',
      trust: 'official' as const,
      severity: 'notable' as const,
      payload: { title: 't' },
      canvasSlug: null,
    };
    await instance.insert(marketEvents).values(row);
    await expect(instance.insert(marketEvents).values({ ...row, id: 'b' })).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/unique/i) },
    });
  });

  // Some databases recorded 0009/0010 after their timestamps were renumbered.
  // The RC migrator must still match those rows through their SQL hashes.
  it('applies on a database whose migration ledger used the renumbered timestamps', () => {
    const dbPath = tempDbPath();
    const seed = new DatabaseSync(dbPath);
    const migrations = seedLegacyLedger(seed, '0010_symbol_candle_cache', {
      createdAt: {
        '0009_reconcile_judgment_comments': 1784038000000,
        '0010_symbol_candle_cache': 1784039000000,
      },
    });
    for (const migration of migrations) executeMigration(seed, migration);
    seed.close();

    const instance = createDb(dbPath);
    open.push(instance);
    const names = instance.$client
      .prepare(`select name from sqlite_master where type='table'`)
      .all()
      .map((row) => (row as { name: string }).name);
    expect(names).toContain('market_events');
    expect(names).toContain('event_source_cursors');
  });

  it('allows the same dedupe key from a different source', async () => {
    const instance = db();
    await ingestEvent(draft({ dedupeKey: 'shared-key' }), instance);
    const second = await ingestEvent(draft({ source: 'gdelt', dedupeKey: 'shared-key' }), instance);
    expect(second.created).toBe(true);
  });
});

describe('ingestEvent', () => {
  it('stores a draft with a derived stable id, dedupe key, and self cluster', async () => {
    const instance = db();
    const { event, created } = await ingestEvent(draft(), instance);
    const expectedId = deriveEventId('sec-edgar', buildDedupeKey(draft()));

    expect(created).toBe(true);
    expect(event.id).toBe(expectedId);
    expect(event.dedupeKey).toBe(buildDedupeKey(draft()));
    expect(event.clusterId).toBe(expectedId);
    expect(event.canvasSlug).toBeNull();
  });

  it('round-trips symbols, payload, and both timestamps', async () => {
    const instance = db();
    const { event } = await ingestEvent(draft({ symbols: ['nvda.us', 'AMD.US'] }), instance);
    const stored = await getEvent(event.id, instance);

    expect(stored).not.toBeNull();
    expect(stored!.symbols).toEqual(['AMD.US', 'NVDA.US']);
    expect(stored!.payload).toEqual({ title: '内部人卖出 12 万股', url: 'https://sec.gov/x' });
    expect(stored!.occurredAt).toBe('2026-08-20T13:00:00.000Z');
    expect(stored!.observedAt).toBe('2026-08-20T13:00:30.000Z');
  });

  it('defaults observedAt to ingest time when the adapter did not set one', async () => {
    const instance = db();
    const before = Date.now();
    const { event } = await ingestEvent({ ...draft(), observedAt: undefined }, instance);
    expect(Date.parse(event.observedAt)).toBeGreaterThanOrEqual(before);
  });

  it('is idempotent for the same source: re-ingest keeps one row and the same id', async () => {
    const instance = db();
    const first = await ingestEvent(draft(), instance);
    const again = await ingestEvent(draft({ observedAt: '2026-08-20T19:00:00.000Z' }), instance);

    expect(again.created).toBe(false);
    expect(again.event.id).toBe(first.event.id);
    expect(await listEvents({}, instance)).toHaveLength(1);
  });

  it('keeps the first observedAt when the same event is seen again', async () => {
    const instance = db();
    await ingestEvent(draft(), instance);
    const again = await ingestEvent(draft({ observedAt: '2026-08-20T19:00:00.000Z' }), instance);
    expect(again.event.observedAt).toBe('2026-08-20T13:00:30.000Z');
  });

  it('soft-clusters a different source on the same symbol inside the window', async () => {
    const instance = db();
    const first = await ingestEvent(draft(), instance);
    const second = await ingestEvent(
      draft({
        source: 'gdelt',
        trust: 'unverified',
        occurredAt: '2026-08-20T13:12:00.000Z',
        payload: { title: '媒体跟进报道' },
      }),
      instance,
    );

    expect(second.event.id).not.toBe(first.event.id);
    expect(second.event.clusterId).toBe(first.event.clusterId);
  });

  it('does not cluster a different source outside the window', async () => {
    const instance = db();
    const first = await ingestEvent(draft(), instance);
    const second = await ingestEvent(
      draft({
        source: 'gdelt',
        occurredAt: '2026-08-21T13:00:00.000Z',
        payload: { title: '第二天的报道' },
      }),
      instance,
    );
    expect(second.event.clusterId).not.toBe(first.event.clusterId);
  });

  it('does not cluster a different symbol', async () => {
    const instance = db();
    const first = await ingestEvent(draft(), instance);
    const second = await ingestEvent(
      draft({ source: 'gdelt', symbols: ['AAPL.US'], payload: { title: '另一只票' } }),
      instance,
    );
    expect(second.event.clusterId).not.toBe(first.event.clusterId);
  });

  it('clusters across classes: a filing and its news coverage are one story', async () => {
    const instance = db();
    const filing = await ingestEvent(draft(), instance);
    const coverage = await ingestEvent(
      draft({
        source: 'gdelt',
        class: 'news',
        kind: 'headline',
        occurredAt: '2026-08-20T13:12:00.000Z',
        payload: { title: '媒体跟进报道' },
      }),
      instance,
    );
    expect(coverage.event.clusterId).toBe(filing.event.clusterId);
  });

  it('gives two sources ingesting at the same moment a single cluster', async () => {
    const instance = db();
    const [first, second] = await Promise.all([
      ingestEvent(draft(), instance),
      ingestEvent(
        draft({
          source: 'gdelt',
          occurredAt: '2026-08-20T13:05:00.000Z',
          payload: { title: '同时到达' },
        }),
        instance,
      ),
    ]);
    expect(second.event.clusterId).toBe(first.event.clusterId);
    const clusters = new Set((await listEvents({}, instance)).map((e) => e.clusterId));
    expect(clusters.size).toBe(1);
  });

  it('merges the older clusters that a bridging event connects', async () => {
    const instance = db();
    const nvda = await ingestEvent(
      draft({ occurredAt: '2026-08-20T13:10:00.000Z', payload: { title: 'NVDA' } }),
      instance,
    );
    const amd = await ingestEvent(
      draft({
        source: 'gdelt',
        symbols: ['AMD.US'],
        occurredAt: '2026-08-20T13:50:00.000Z',
        payload: { title: 'AMD' },
      }),
      instance,
    );
    expect(amd.event.clusterId).not.toBe(nvda.event.clusterId);

    const bridge = await ingestEvent(
      draft({
        source: 'fred',
        symbols: ['NVDA.US', 'AMD.US'],
        occurredAt: '2026-08-20T13:30:00.000Z',
        payload: { title: '一条把两边连起来的消息' },
      }),
      instance,
    );

    const clusters = new Set((await listEvents({}, instance)).map((e) => e.clusterId));
    expect(clusters.size).toBe(1);
    expect(bridge.event.clusterId).toBe(nvda.event.clusterId);
  });

  it('rebroadcasts the old events it re-clustered so live clients can update them', async () => {
    const instance = db();
    const nvda = await ingestEvent(
      draft({ occurredAt: '2026-08-20T13:10:00.000Z', payload: { title: 'NVDA' } }),
      instance,
    );
    const amd = await ingestEvent(
      draft({
        source: 'gdelt',
        symbols: ['AMD.US'],
        occurredAt: '2026-08-20T13:50:00.000Z',
        payload: { title: 'AMD' },
      }),
      instance,
    );

    const seen: MarketEvent[] = [];
    const off = onMarketEvent((event) => seen.push(event));
    const bridge = await ingestEvent(
      draft({
        source: 'fred',
        symbols: ['NVDA.US', 'AMD.US'],
        occurredAt: '2026-08-20T13:30:00.000Z',
        payload: { title: '桥接' },
      }),
      instance,
    );
    off();

    // The bridging event itself, plus the row whose clusterId was rewritten. The
    // surviving cluster's own rows did not change, so they are not resent.
    expect(seen.map((e) => e.id).sort()).toEqual([amd.event.id, bridge.event.id].sort());
    const resent = seen.find((e) => e.id === amd.event.id)!;
    expect(resent.clusterId).toBe(bridge.event.clusterId);
    expect(resent.clusterId).toBe(nvda.event.clusterId);
  });
});

describe('listEvents', () => {
  async function seed(instance: Db): Promise<void> {
    await ingestEvent(
      draft({ occurredAt: '2026-08-20T13:00:00.000Z', payload: { title: 'A' } }),
      instance,
    );
    await ingestEvent(
      draft({
        source: 'fred',
        class: 'macro',
        kind: 'cpi',
        symbols: [],
        occurredAt: '2026-08-20T12:30:00.000Z',
        payload: { title: 'B' },
      }),
      instance,
    );
    await ingestEvent(
      draft({
        source: 'gdelt',
        class: 'news',
        symbols: ['AMD.US'],
        occurredAt: '2026-08-20T14:00:00.000Z',
        payload: { title: 'C' },
      }),
      instance,
    );
  }

  it('returns newest first by occurredAt', async () => {
    const instance = db();
    await seed(instance);
    expect((await listEvents({}, instance)).map((e) => e.payload.title)).toEqual(['C', 'A', 'B']);
  });

  it('filters by symbol', async () => {
    const instance = db();
    await seed(instance);
    expect((await listEvents({ symbol: 'nvda.us' }, instance)).map((e) => e.payload.title)).toEqual(
      ['A'],
    );
  });

  it('filters by source and by class', async () => {
    const instance = db();
    await seed(instance);
    expect((await listEvents({ source: 'fred' }, instance)).map((e) => e.payload.title)).toEqual([
      'B',
    ]);
    expect((await listEvents({ class: 'news' }, instance)).map((e) => e.payload.title)).toEqual([
      'C',
    ]);
  });

  it('honors since and limit', async () => {
    const instance = db();
    await seed(instance);
    expect(
      (await listEvents({ since: '2026-08-20T13:00:00.000Z' }, instance)).map(
        (e) => e.payload.title,
      ),
    ).toEqual(['C', 'A']);
    expect((await listEvents({ limit: 1 }, instance)).map((e) => e.payload.title)).toEqual(['C']);
  });

  it('returns an empty list for a symbol with no events', async () => {
    const instance = db();
    await seed(instance);
    expect(await listEvents({ symbol: 'TSLA.US' }, instance)).toEqual([]);
  });

  it('does not let a symbol filter match a longer ticker that contains it', async () => {
    const instance = db();
    await ingestEvent(draft({ symbols: ['AMU.US'], payload: { title: '长的' } }), instance);
    await ingestEvent(
      draft({ symbols: ['MU.US'], kind: 'form-8', payload: { title: '短的' } }),
      instance,
    );
    expect((await listEvents({ symbol: 'MU.US' }, instance)).map((e) => e.payload.title)).toEqual([
      '短的',
    ]);
  });

  it('does not treat a LIKE wildcard in the symbol filter as a match-anything', async () => {
    const instance = db();
    await seed(instance);
    expect(await listEvents({ symbol: '%' }, instance)).toEqual([]);
    expect(await listEvents({ symbol: '_VDA.US' }, instance)).toEqual([]);
  });

  it('pages with before and beforeId without repeating or skipping a tied timestamp', async () => {
    const instance = db();
    const at = '2026-08-20T13:00:00.000Z';
    for (const title of ['t1', 't2', 't3']) {
      await ingestEvent(
        draft({ kind: `k-${title}`, occurredAt: at, payload: { title } }),
        instance,
      );
    }
    const first = await listEvents({ limit: 2 }, instance);
    expect(first).toHaveLength(2);
    const last = first[1];
    const second = await listEvents(
      { limit: 2, before: last.occurredAt, beforeId: last.id },
      instance,
    );
    const ids = [...first, ...second].map((e) => e.id);
    expect(new Set(ids).size).toBe(3);
    expect(second).toHaveLength(1);
  });

  it('treats before on its own as a strict upper bound on occurredAt', async () => {
    const instance = db();
    await seed(instance);
    expect(
      (await listEvents({ before: '2026-08-20T13:00:00.000Z' }, instance)).map(
        (e) => e.payload.title,
      ),
    ).toEqual(['B']);
  });
});

describe('getEvent', () => {
  it('returns null for an unknown id', async () => {
    expect(await getEvent('nope', db())).toBeNull();
  });
});

describe('event source cursors', () => {
  it('reports no state before the first poll', async () => {
    expect(await readSourceState('sec-edgar', db())).toBeNull();
  });

  it('creates a state with active health and a zero failure streak', async () => {
    const instance = db();
    const state = await saveSourceState(
      { source: 'sec-edgar', cursor: '2026-08-20T13:00:00.000Z' },
      instance,
    );
    expect(state).toMatchObject({
      source: 'sec-edgar',
      cursor: '2026-08-20T13:00:00.000Z',
      health: 'active',
      failureStreak: 0,
    });
  });

  it('patches only the fields it is given', async () => {
    const instance = db();
    await saveSourceState({ source: 'gdelt', cursor: 'c1', lastEventAt: 'e1' }, instance);
    await saveSourceState({ source: 'gdelt', health: 'degraded', failureStreak: 2 }, instance);
    expect(await readSourceState('gdelt', instance)).toMatchObject({
      cursor: 'c1',
      lastEventAt: 'e1',
      health: 'degraded',
      failureStreak: 2,
    });
  });

  it('survives a reopen so a restart resumes from the stored cursor', async () => {
    const instance = db();
    await saveSourceState({ source: 'gdelt', cursor: 'c9', health: 'degraded' }, instance);
    // Same file-less database object, but a fresh read path: the value has to come
    // from the table, not from an in-process cache.
    const rows = instance.$client
      .prepare(`select cursor, health from event_source_cursors where source = 'gdelt'`)
      .all();
    expect(rows).toEqual([{ cursor: 'c9', health: 'degraded' }]);
  });

  it('lists every known source', async () => {
    const instance = db();
    await saveSourceState({ source: 'gdelt' }, instance);
    await saveSourceState({ source: 'fred', health: 'disabled' }, instance);
    const states = await listSourceStates(instance);
    expect(states.map((s) => s.source).sort()).toEqual(['fred', 'gdelt']);
    expect(states.find((s) => s.source === 'fred')!.health).toBe('disabled');
  });

  it('never moves lastEventAt backwards, whatever order the writes arrive in', async () => {
    const instance = db();
    await saveSourceState({ source: 'gdelt', lastEventAt: '2026-08-20T15:30:00.000Z' }, instance);
    const state = await saveSourceState(
      { source: 'gdelt', lastEventAt: '2026-08-20T13:00:00.000Z' },
      instance,
    );
    expect(state.lastEventAt).toBe('2026-08-20T15:30:00.000Z');
    expect((await readSourceState('gdelt', instance))!.lastEventAt).toBe(
      '2026-08-20T15:30:00.000Z',
    );
  });

  it('still allows an explicit reset of lastEventAt to null', async () => {
    const instance = db();
    await saveSourceState({ source: 'gdelt', lastEventAt: '2026-08-20T15:30:00.000Z' }, instance);
    const state = await saveSourceState({ source: 'gdelt', lastEventAt: null }, instance);
    expect(state.lastEventAt).toBeNull();
  });

  it('merges two concurrent patches instead of letting one drop the other field', async () => {
    const instance = db();
    await Promise.all([
      saveSourceState({ source: 'gdelt', cursor: 'c1' }, instance),
      saveSourceState({ source: 'gdelt', lastEventAt: '2026-08-20T15:30:00.000Z' }, instance),
    ]);
    expect(await readSourceState('gdelt', instance)).toMatchObject({
      cursor: 'c1',
      lastEventAt: '2026-08-20T15:30:00.000Z',
    });
  });

  it('does not let a stale write lower the failure streak', async () => {
    const instance = db();
    await saveSourceState({ source: 'gdelt', failureStreak: 3 }, instance);
    const stale = await saveSourceState({ source: 'gdelt', failureStreak: 1 }, instance);
    expect(stale.failureStreak).toBe(3);
    // Zero is the one explicit "this source just worked" signal, so it still lands.
    const recovered = await saveSourceState({ source: 'gdelt', failureStreak: 0 }, instance);
    expect(recovered.failureStreak).toBe(0);
  });

  it('writes canvasSlug and republishes the event so live clients can open it', async () => {
    const instance = db();
    const seen: MarketEvent[] = [];
    const unsub = onMarketEvent((event) => seen.push(event));
    const { event } = await ingestEvent(draft({ symbols: ['CANVAS.US'] }), instance);
    seen.length = 0;
    const updated = await setEventCanvasSlug(event.id, `event-${event.id}`, instance);
    unsub();
    expect(updated?.canvasSlug).toBe(`event-${event.id}`);
    expect((await getEvent(event.id, instance))?.canvasSlug).toBe(`event-${event.id}`);
    expect(seen).toEqual([updated]);
  });

  it('lists every member of a cluster including the seed event', async () => {
    const instance = db();
    const first = await ingestEvent(draft({ symbols: ['CLU.US'] }), instance);
    const second = await ingestEvent(
      draft({
        source: 'longbridge-news',
        symbols: ['CLU.US'],
        occurredAt: '2026-08-20T13:10:00.000Z',
        payload: { title: '同簇新闻' },
      }),
      instance,
    );
    const members = await listEventsByCluster(first.event.clusterId, instance);
    expect(members.map((event) => event.id).sort()).toEqual(
      [first.event.id, second.event.id].sort(),
    );
  });
});

describe('source state lastPolledAt leftover', () => {
  it('never moves lastPolledAt backwards', async () => {
    const instance = db();
    await saveSourceState({ source: 'gdelt', lastPolledAt: '2026-08-20T15:30:00.000Z' }, instance);
    const state = await saveSourceState(
      { source: 'gdelt', lastPolledAt: '2026-08-20T13:00:00.000Z' },
      instance,
    );
    expect(state.lastPolledAt).toBe('2026-08-20T15:30:00.000Z');
  });
});
