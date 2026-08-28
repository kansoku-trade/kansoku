import { afterEach, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../src/db/index.js';
import type { EventPollContext, EventSourceAdapter } from '../src/events/registry.js';
import { createEventRuntime } from '../src/events/runtime.js';
import { listEvents, readSourceState } from '../src/events/store.js';

const open: Db[] = [];

function db(): Db {
  const instance = createDb(':memory:');
  open.push(instance);
  return instance;
}

afterEach(() => {
  for (const instance of open.splice(0)) instance.$client.close();
});

interface Gate {
  adapter: EventSourceAdapter;
  contexts: EventPollContext[];
  release: () => void;
  started: Promise<void>;
}

// A source whose poll blocks until the test lets it finish, so a stop can land while
// a cycle is genuinely in flight.
function gated(source = 'gated'): Gate {
  const contexts: EventPollContext[] = [];
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let announce!: () => void;
  const started = new Promise<void>((resolve) => {
    announce = resolve;
  });

  return {
    adapter: {
      intervalMs: 60_000,
      poll: async (ctx) => {
        contexts.push(ctx);
        announce();
        await blocked;
        return {
          cursor: 'written-by-a-stopped-poll',
          drafts: [
            {
              class: 'news',
              dedupeKey: 'late-1',
              kind: 'headline',
              occurredAt: '2026-08-20T13:00:00.000Z',
              payload: { title: '迟到的新闻' },
              severity: 'info',
              source,
              symbols: ['NVDA.US'],
              trust: 'unverified',
            },
          ],
        };
      },
      source,
    },
    contexts,
    release,
    started,
  };
}

describe('runtime hands each source an abort signal', () => {
  it('passes a live signal into poll', async () => {
    const gate = gated();
    const runtime = createEventRuntime({ adapters: [gate.adapter], db: db() });

    await runtime.startSource('gated');
    await gate.started;

    expect(gate.contexts).toHaveLength(1);
    expect(gate.contexts[0].signal).toBeInstanceOf(AbortSignal);
    expect(gate.contexts[0].signal!.aborted).toBe(false);

    gate.release();
    await runtime.stop();
  });

  it('aborts the in-flight request when the source is stopped', async () => {
    const gate = gated();
    const runtime = createEventRuntime({ adapters: [gate.adapter], db: db() });

    await runtime.startSource('gated');
    await gate.started;
    await runtime.stopSource('gated');

    expect(gate.contexts[0].signal!.aborted).toBe(true);
    gate.release();
  });

  it('aborts every source when the whole runtime stops', async () => {
    const first = gated('one');
    const second = gated('two');
    const runtime = createEventRuntime({ adapters: [first.adapter, second.adapter], db: db() });

    await runtime.startSource('one');
    await runtime.startSource('two');
    await Promise.all([first.started, second.started]);
    await runtime.stop();

    expect(first.contexts[0].signal!.aborted).toBe(true);
    expect(second.contexts[0].signal!.aborted).toBe(true);
    first.release();
    second.release();
  });

  it('gives a restarted source a fresh signal', async () => {
    const gate = gated();
    const runtime = createEventRuntime({ adapters: [gate.adapter], db: db() });

    await runtime.startSource('gated');
    await gate.started;
    await runtime.stopSource('gated');
    gate.release();
    await runtime.startSource('gated');

    // The second cycle must not inherit the aborted signal from the first, or the
    // source would be dead on arrival after any restart.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(gate.contexts.length).toBeGreaterThanOrEqual(2);
    expect(gate.contexts.at(-1)!.signal!.aborted).toBe(false);
    await runtime.stop();
  });
});

describe('a poll that outlives its collector writes nothing', () => {
  it('drops the result of a poll that finished after stop', async () => {
    const instance = db();
    const gate = gated();
    const runtime = createEventRuntime({ adapters: [gate.adapter], db: instance });

    await runtime.startSource('gated');
    await gate.started;
    await runtime.stop();

    // The adapter did not notice the abort and answers anyway, which is exactly what a
    // hot reload looks like from the database's point of view.
    gate.release();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(await listEvents({ source: 'gated' }, instance)).toEqual([]);
    const state = await readSourceState('gated', instance);
    expect(state?.cursor ?? null).not.toBe('written-by-a-stopped-poll');
  });

  it('lets a new collector own the source without the old poll interfering', async () => {
    const instance = db();
    const stale = gated();
    const old = createEventRuntime({ adapters: [stale.adapter], db: instance });
    await old.startSource('gated');
    await stale.started;
    await old.stop();

    const fresh = gated();
    const next = createEventRuntime({ adapters: [fresh.adapter], db: instance });
    await next.startSource('gated');
    await fresh.started;

    // The abandoned poll answers late; only the live runtime's result may land.
    stale.release();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await listEvents({ source: 'gated' }, instance)).toEqual([]);

    fresh.release();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await listEvents({ source: 'gated' }, instance)).toHaveLength(1);
    await next.stop();
  });

  it('still ingests a poll that finishes while the source is running', async () => {
    const instance = db();
    const gate = gated();
    const runtime = createEventRuntime({ adapters: [gate.adapter], db: instance });

    await runtime.startSource('gated');
    await gate.started;
    gate.release();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(await listEvents({ source: 'gated' }, instance)).toHaveLength(1);
    const state = await readSourceState('gated', instance);
    expect(state?.cursor).toBe('written-by-a-stopped-poll');
    await runtime.stop();
  });
});
