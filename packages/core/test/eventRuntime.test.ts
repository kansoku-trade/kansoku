import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb, type Db } from '../src/db/index.js';
import type { EventPollResult, EventSourceAdapter } from '../src/events/registry.js';
import {
  clearEventAdapters,
  listEventAdapters,
  registerEventAdapter,
} from '../src/events/registry.js';
import { backoffDelayMs, createEventRuntime, MAX_BACKOFF_MS } from '../src/events/runtime.js';
import { listEvents, readSourceState, saveSourceState } from '../src/events/store.js';
import type { MarketEventDraft } from '../src/events/types.js';

const open: Db[] = [];

function db(): Db {
  const instance = createDb(':memory:');
  open.push(instance);
  return instance;
}

beforeEach(() => {
  clearEventAdapters();
});

afterEach(() => {
  clearEventAdapters();
  for (const instance of open.splice(0)) instance.$client.close();
});

function draft(overrides: Partial<MarketEventDraft> = {}): MarketEventDraft {
  return {
    source: 'stub',
    class: 'news',
    kind: 'headline',
    symbols: ['NVDA.US'],
    occurredAt: '2026-08-20T13:00:00.000Z',
    observedAt: '2026-08-20T13:00:10.000Z',
    trust: 'unverified',
    severity: 'info',
    payload: { title: '标题' },
    ...overrides,
  };
}

// Every database call on this handle throws while its method name is in the set,
// so a test can take the database away mid-cycle and give it back later. The
// transaction handle is wrapped too, otherwise a statement run inside a
// transaction would sail past the injected outage.
function faultyDb(real: Db, failing: Set<string>): Db {
  const wrap = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(t, prop) {
        const value = Reflect.get(t, prop) as unknown;
        if (typeof value !== 'function' || typeof prop !== 'string') return value;
        const call = value as (...a: unknown[]) => unknown;
        if (prop === 'transaction') {
          return (body: (tx: object) => unknown, ...rest: unknown[]) => {
            if (failing.has('transaction')) throw new Error('database is down (transaction)');
            return call.apply(t, [(tx: object) => body(wrap(tx)), ...rest]);
          };
        }
        return (...args: unknown[]) => {
          if (failing.has(prop)) throw new Error(`database is down (${prop})`);
          return call.apply(t, args);
        };
      },
    });
  return wrap(real as object) as Db;
}

// A promise whose settlement the test controls, for the window between calling
// subscribe() and getting a detach function back.
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// The push path is promise-only, so draining microtasks is enough: no timer has to
// fire for a queued push to be written.
async function flush(): Promise<void> {
  for (let i = 0; i < 200; i += 1) await Promise.resolve();
}

interface StubAdapter extends EventSourceAdapter {
  cursorsSeen: (string | null)[];
  calls: number;
}

function stubAdapter(
  overrides: Partial<EventSourceAdapter> & { result?: () => EventPollResult } = {},
): StubAdapter {
  const cursorsSeen: (string | null)[] = [];
  const adapter = {
    source: overrides.source ?? 'stub',
    intervalMs: overrides.intervalMs ?? 1000,
    ...(overrides.enabled !== undefined ? { enabled: overrides.enabled } : {}),
    cursorsSeen,
    calls: 0,
    poll: async ({ cursor }: { cursor: string | null }) => {
      cursorsSeen.push(cursor);
      adapter.calls += 1;
      return overrides.result ? overrides.result() : { drafts: [] };
    },
  } as StubAdapter;
  return adapter;
}

describe('event adapter registry', () => {
  it('starts empty and lists what was registered, in registration order', () => {
    expect(listEventAdapters()).toEqual([]);
    const a = stubAdapter({ source: 'a' });
    const b = stubAdapter({ source: 'b' });
    registerEventAdapter(a);
    registerEventAdapter(b);
    expect(listEventAdapters().map((x) => x.source)).toEqual(['a', 'b']);
  });

  it('rejects a second adapter claiming the same source', () => {
    registerEventAdapter(stubAdapter({ source: 'a' }));
    expect(() => registerEventAdapter(stubAdapter({ source: 'a' }))).toThrow(/a/);
  });

  it('rejects an adapter that can neither poll nor subscribe', () => {
    expect(() =>
      registerEventAdapter({ source: 'empty', intervalMs: 1000 } as EventSourceAdapter),
    ).toThrow();
  });

  it('rejects a poll adapter whose interval would busy-loop or never fire', () => {
    for (const intervalMs of [0, -1000, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        registerEventAdapter(stubAdapter({ source: `i${intervalMs}`, intervalMs })),
      ).toThrow(/interval/i);
    }
  });
});

describe('backoffDelayMs', () => {
  it('uses the plain interval while the source is healthy', () => {
    expect(backoffDelayMs(0, 1000)).toBe(1000);
  });

  it('doubles per consecutive failure', () => {
    expect(backoffDelayMs(1, 1000)).toBe(2000);
    expect(backoffDelayMs(2, 1000)).toBe(4000);
    expect(backoffDelayMs(3, 1000)).toBe(8000);
  });

  it('caps the delay so a dead source still retries', () => {
    expect(backoffDelayMs(40, 1000)).toBe(MAX_BACKOFF_MS);
  });
});

describe('pollOnce', () => {
  it('passes a null cursor on the very first poll', async () => {
    const instance = db();
    const adapter = stubAdapter();
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });
    await runtime.pollOnce('stub');
    expect(adapter.cursorsSeen).toEqual([null]);
  });

  it('persists the returned cursor and hands it back on the next poll', async () => {
    const instance = db();
    const adapter = stubAdapter({ result: () => ({ drafts: [], cursor: 'c1' }) });
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });
    await runtime.pollOnce('stub');
    await runtime.pollOnce('stub');
    expect(adapter.cursorsSeen).toEqual([null, 'c1']);
    expect((await readSourceState('stub', instance))!.cursor).toBe('c1');
  });

  it('resumes from a cursor written before the process started', async () => {
    const instance = db();
    await saveSourceState({ source: 'stub', cursor: 'restart-cursor' }, instance);
    const adapter = stubAdapter();
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });
    await runtime.pollOnce('stub');
    expect(adapter.cursorsSeen).toEqual(['restart-cursor']);
  });

  it('marks the source active and records the poll time on success', async () => {
    const instance = db();
    const runtime = createEventRuntime({ adapters: [stubAdapter()], db: instance });
    await runtime.pollOnce('stub');
    const state = (await readSourceState('stub', instance))!;
    expect(state.health).toBe('active');
    expect(state.failureStreak).toBe(0);
    expect(state.lastPolledAt).not.toBeNull();
  });

  it('ingests the drafts it collected and reports the counts', async () => {
    const instance = db();
    const runtime = createEventRuntime({
      adapters: [stubAdapter({ result: () => ({ drafts: [draft(), draft({ kind: 'other' })] }) })],
      db: instance,
    });
    expect(await runtime.pollOnce('stub')).toEqual({ ingested: 2, deduped: 0 });
    expect(await listEvents({}, instance)).toHaveLength(2);
  });

  it('counts a repeated draft as deduped rather than ingesting it twice', async () => {
    const instance = db();
    const runtime = createEventRuntime({
      adapters: [stubAdapter({ result: () => ({ drafts: [draft()] }) })],
      db: instance,
    });
    await runtime.pollOnce('stub');
    expect(await runtime.pollOnce('stub')).toEqual({ ingested: 0, deduped: 1 });
    expect(await listEvents({}, instance)).toHaveLength(1);
  });

  it('records the newest occurredAt it ingested as lastEventAt', async () => {
    const instance = db();
    const runtime = createEventRuntime({
      adapters: [
        stubAdapter({
          result: () => ({
            drafts: [
              draft({ occurredAt: '2026-08-20T13:00:00.000Z' }),
              draft({ occurredAt: '2026-08-20T15:30:00.000Z', kind: 'later' }),
            ],
          }),
        }),
      ],
      db: instance,
    });
    await runtime.pollOnce('stub');
    expect((await readSourceState('stub', instance))!.lastEventAt).toBe('2026-08-20T15:30:00.000Z');
  });

  it('leaves lastEventAt untouched when a poll returned nothing', async () => {
    const instance = db();
    const runtime = createEventRuntime({
      adapters: [stubAdapter({ result: () => ({ drafts: [] }) })],
      db: instance,
    });
    await runtime.pollOnce('stub');
    expect((await readSourceState('stub', instance))!.lastEventAt).toBeNull();
  });

  it('records a failure without going degraded on the first miss', async () => {
    const instance = db();
    const adapter: EventSourceAdapter = {
      source: 'stub',
      intervalMs: 1000,
      poll: async () => {
        throw new Error('rate limited');
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });
    await runtime.pollOnce('stub');
    const state = (await readSourceState('stub', instance))!;
    expect(state.health).toBe('active');
    expect(state.failureStreak).toBe(1);
    expect(state.lastError).toContain('rate limited');
    expect(state.nextAttemptAt).not.toBeNull();
  });

  it('goes degraded on the second consecutive failure', async () => {
    const instance = db();
    const adapter: EventSourceAdapter = {
      source: 'stub',
      intervalMs: 1000,
      poll: async () => {
        throw new Error('boom');
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });
    await runtime.pollOnce('stub');
    await runtime.pollOnce('stub');
    expect((await readSourceState('stub', instance))!).toMatchObject({
      health: 'degraded',
      failureStreak: 2,
    });
  });

  it('recovers to active and clears the error after a success', async () => {
    const instance = db();
    let fail = true;
    const adapter: EventSourceAdapter = {
      source: 'stub',
      intervalMs: 1000,
      poll: async () => {
        if (fail) throw new Error('boom');
        return { drafts: [] };
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });
    await runtime.pollOnce('stub');
    await runtime.pollOnce('stub');
    fail = false;
    await runtime.pollOnce('stub');
    expect((await readSourceState('stub', instance))!).toMatchObject({
      health: 'active',
      failureStreak: 0,
      lastError: null,
    });
  });

  it('does not advance the cursor when the poll threw', async () => {
    const instance = db();
    await saveSourceState({ source: 'stub', cursor: 'kept' }, instance);
    const adapter: EventSourceAdapter = {
      source: 'stub',
      intervalMs: 1000,
      poll: async () => {
        throw new Error('boom');
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });
    await runtime.pollOnce('stub');
    expect((await readSourceState('stub', instance))!.cursor).toBe('kept');
  });

  it('refuses to poll a disabled source and records it as disabled', async () => {
    const instance = db();
    const adapter = stubAdapter({ enabled: false });
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });
    expect(await runtime.pollOnce('stub')).toEqual({ ingested: 0, deduped: 0 });
    expect(adapter.calls).toBe(0);
    expect((await readSourceState('stub', instance))!.health).toBe('disabled');
  });

  it('throws for a source that has no adapter', async () => {
    const runtime = createEventRuntime({ adapters: [], db: db() });
    await expect(runtime.pollOnce('ghost')).rejects.toThrow(/ghost/);
  });

  it('defaults to the registered adapters when none are passed in', async () => {
    const instance = db();
    const adapter = stubAdapter({ source: 'registered' });
    registerEventAdapter(adapter);
    const runtime = createEventRuntime({ db: instance });
    await runtime.pollOnce('registered');
    expect(adapter.calls).toBe(1);
  });
});

describe('runtime start and stop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls immediately and then on each source own interval', async () => {
    const fast = stubAdapter({ source: 'fast', intervalMs: 1000 });
    const slow = stubAdapter({ source: 'slow', intervalMs: 5000 });
    const runtime = createEventRuntime({ adapters: [fast, slow], db: db() });

    await runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fast.calls).toBe(1);
    expect(slow.calls).toBe(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fast.calls).toBe(6);
    expect(slow.calls).toBe(2);

    await runtime.stop();
  });

  it('reports which sources are running and clears them on stop', async () => {
    const runtime = createEventRuntime({
      adapters: [stubAdapter({ source: 'a' }), stubAdapter({ source: 'b' })],
      db: db(),
    });
    await runtime.start();
    expect(runtime.runningSources()).toEqual(['a', 'b']);
    await runtime.stop();
    expect(runtime.runningSources()).toEqual([]);
  });

  it('stops polling after stop', async () => {
    const adapter = stubAdapter();
    const runtime = createEventRuntime({ adapters: [adapter], db: db() });
    await runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    await runtime.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(adapter.calls).toBe(1);
  });

  it('stops one source without touching the other', async () => {
    const a = stubAdapter({ source: 'a', intervalMs: 1000 });
    const b = stubAdapter({ source: 'b', intervalMs: 1000 });
    const runtime = createEventRuntime({ adapters: [a, b], db: db() });
    await runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    await runtime.stopSource('a');

    await vi.advanceTimersByTimeAsync(3000);
    expect(a.calls).toBe(1);
    expect(b.calls).toBe(4);
    expect(runtime.runningSources()).toEqual(['b']);
    await runtime.stop();
  });

  it('starts a single source on its own', async () => {
    const a = stubAdapter({ source: 'a', intervalMs: 1000 });
    const b = stubAdapter({ source: 'b', intervalMs: 1000 });
    const runtime = createEventRuntime({ adapters: [a, b], db: db() });
    await runtime.startSource('b');
    await vi.advanceTimersByTimeAsync(0);
    expect(a.calls).toBe(0);
    expect(b.calls).toBe(1);
    await runtime.stop();
  });

  it('does not double-schedule when start is called twice', async () => {
    const adapter = stubAdapter({ intervalMs: 1000 });
    const runtime = createEventRuntime({ adapters: [adapter], db: db() });
    await runtime.start();
    await runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(adapter.calls).toBe(2);
    await runtime.stop();
  });

  it('backs off a failing source while the healthy source keeps its cadence', async () => {
    let brokenCalls = 0;
    const broken: EventSourceAdapter = {
      source: 'broken',
      intervalMs: 1000,
      poll: async () => {
        brokenCalls += 1;
        throw new Error('boom');
      },
    };
    const healthy = stubAdapter({ source: 'healthy', intervalMs: 1000 });
    const runtime = createEventRuntime({ adapters: [broken, healthy], db: db() });

    await runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(brokenCalls).toBe(1);

    // First retry waits 2×1000, the second 4×1000: 7s covers exactly two retries.
    await vi.advanceTimersByTimeAsync(7000);
    expect(brokenCalls).toBe(3);
    expect(healthy.calls).toBe(8);

    await runtime.stop();
  });

  it('never polls a disabled source', async () => {
    const off = stubAdapter({ source: 'off', enabled: false, intervalMs: 1000 });
    const on = stubAdapter({ source: 'on', intervalMs: 1000 });
    const instance = db();
    const runtime = createEventRuntime({ adapters: [off, on], db: instance });

    await runtime.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(off.calls).toBe(0);
    expect(on.calls).toBeGreaterThan(1);
    expect(runtime.runningSources()).toEqual(['on']);
    expect((await readSourceState('off', instance))!.health).toBe('disabled');

    await runtime.stop();
  });

  it('attaches a subscription adapter, ingests what it pushes, and detaches on stop', async () => {
    const instance = db();
    let emit: ((result: EventPollResult) => void) | undefined;
    let detached = false;
    const adapter: EventSourceAdapter = {
      source: 'stream',
      intervalMs: 1000,
      subscribe: (ctx) => {
        emit = ctx.emit;
        return () => {
          detached = true;
        };
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });

    await runtime.start();
    expect(emit).toBeDefined();
    emit!({ drafts: [draft({ source: 'stream' })] });
    await flush();
    expect(await listEvents({ source: 'stream' }, instance)).toHaveLength(1);

    await runtime.stop();
    expect(detached).toBe(true);
  });

  it('hands a subscription the cursor stored before the restart', async () => {
    const instance = db();
    await saveSourceState({ source: 'stream', cursor: 'stream-cursor' }, instance);
    const seen: (string | null)[] = [];
    const adapter: EventSourceAdapter = {
      source: 'stream',
      intervalMs: 1000,
      subscribe: (ctx) => {
        seen.push(ctx.cursor);
        return () => {};
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });
    await runtime.start();
    expect(seen).toEqual(['stream-cursor']);
    await runtime.stop();
  });

  it('persists the cursor a subscription pushed so a restart resumes from it', async () => {
    const instance = db();
    let emit: ((result: EventPollResult) => void) | undefined;
    const adapter: EventSourceAdapter = {
      source: 'stream',
      intervalMs: 1000,
      subscribe: (ctx) => {
        emit = ctx.emit;
        return () => {};
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });
    await runtime.start();
    emit!({ drafts: [draft({ source: 'stream' })], cursor: 'offset-42' });
    await flush();
    expect((await readSourceState('stream', instance))!.cursor).toBe('offset-42');
    await runtime.stop();
  });

  it('degrades and backs off a subscription that reports its own errors', async () => {
    const instance = db();
    let fail: ((error: unknown) => void) | undefined;
    let attaches = 0;
    const adapter: EventSourceAdapter = {
      source: 'stream',
      intervalMs: 1000,
      subscribe: (ctx) => {
        attaches += 1;
        fail = ctx.fail;
        return () => {};
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });
    await runtime.start();

    fail!(new Error('socket closed'));
    await flush();
    const first = (await readSourceState('stream', instance))!;
    expect(first).toMatchObject({ health: 'active', failureStreak: 1 });
    expect(first.lastError).toContain('socket closed');
    expect(first.nextAttemptAt).not.toBeNull();

    // Reattaches on the backoff schedule instead of sitting there dead.
    await vi.advanceTimersByTimeAsync(2000);
    expect(attaches).toBe(2);

    fail!(new Error('socket closed again'));
    await flush();
    expect((await readSourceState('stream', instance))!).toMatchObject({
      health: 'degraded',
      failureStreak: 2,
    });

    await runtime.stop();
  });

  it('keeps starting the remaining sources when one subscription cannot attach', async () => {
    const instance = db();
    const broken: EventSourceAdapter = {
      source: 'broken-stream',
      intervalMs: 1000,
      subscribe: () => {
        throw new Error('handshake rejected');
      },
    };
    const healthy = stubAdapter({ source: 'healthy', intervalMs: 1000 });
    const runtime = createEventRuntime({ adapters: [broken, healthy], db: instance });

    await runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(healthy.calls).toBe(1);
    expect(runtime.runningSources()).toContain('healthy');
    const state = (await readSourceState('broken-stream', instance))!;
    expect(state.failureStreak).toBe(1);
    expect(state.lastError).toContain('handshake rejected');

    await runtime.stop();
  });

  it('retries a subscription that failed to attach and recovers when it comes back', async () => {
    const instance = db();
    let attaches = 0;
    let emit: ((result: EventPollResult) => void) | undefined;
    const adapter: EventSourceAdapter = {
      source: 'stream',
      intervalMs: 1000,
      subscribe: (ctx) => {
        attaches += 1;
        if (attaches < 3) throw new Error('handshake rejected');
        emit = ctx.emit;
        return () => {};
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });
    await runtime.start();
    expect(attaches).toBe(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(attaches).toBe(2);
    expect((await readSourceState('stream', instance))!.health).toBe('degraded');

    // Reconnecting clears the error, but only a delivered event proves the stream
    // is actually flowing again, so that is what resets the failure streak.
    await vi.advanceTimersByTimeAsync(4000);
    expect(attaches).toBe(3);
    expect((await readSourceState('stream', instance))!).toMatchObject({
      health: 'active',
      failureStreak: 2,
      lastError: null,
    });

    emit!({ drafts: [draft({ source: 'stream' })] });
    await flush();
    expect((await readSourceState('stream', instance))!).toMatchObject({
      health: 'active',
      failureStreak: 0,
    });

    await runtime.stop();
  });

  it('cancels the pending retry of a failed subscription on stop', async () => {
    const instance = db();
    let attaches = 0;
    const adapter: EventSourceAdapter = {
      source: 'stream',
      intervalMs: 1000,
      subscribe: () => {
        attaches += 1;
        throw new Error('handshake rejected');
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });
    await runtime.start();
    expect(attaches).toBe(1);

    await runtime.stop();
    expect(runtime.runningSources()).toEqual([]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(attaches).toBe(1);
  });

  it('serializes pushes so a slow one cannot overwrite a newer cursor', async () => {
    const instance = db();
    let emit: ((result: EventPollResult) => void) | undefined;
    const adapter: EventSourceAdapter = {
      source: 'stream',
      intervalMs: 1000,
      subscribe: (ctx) => {
        emit = ctx.emit;
        return () => {};
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });
    await runtime.start();

    // The first push has work to do, the second has none: whoever writes last wins,
    // so this is exactly the race that used to leave a stale cursor behind.
    emit!({
      drafts: [draft({ source: 'stream' }), draft({ source: 'stream', kind: 'second' })],
      cursor: 'offset-1',
    });
    emit!({ drafts: [], cursor: 'offset-2' });
    await flush();

    expect((await readSourceState('stream', instance))!.cursor).toBe('offset-2');
    await runtime.stop();
  });

  it('does not let a late push drag lastEventAt backwards', async () => {
    const instance = db();
    let emit: ((result: EventPollResult) => void) | undefined;
    const adapter: EventSourceAdapter = {
      source: 'stream',
      intervalMs: 1000,
      subscribe: (ctx) => {
        emit = ctx.emit;
        return () => {};
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });
    await runtime.start();

    emit!({ drafts: [draft({ source: 'stream', occurredAt: '2026-08-20T15:30:00.000Z' })] });
    emit!({
      drafts: [draft({ source: 'stream', occurredAt: '2026-08-20T13:00:00.000Z', kind: 'older' })],
    });
    await flush();

    expect((await readSourceState('stream', instance))!.lastEventAt).toBe(
      '2026-08-20T15:30:00.000Z',
    );
    await runtime.stop();
  });

  it('keeps a source degraded when a failure lands after a successful push', async () => {
    const instance = db();
    let emit: ((result: EventPollResult) => void) | undefined;
    let fail: ((error: unknown) => void) | undefined;
    const adapter: EventSourceAdapter = {
      source: 'stream',
      intervalMs: 1000,
      subscribe: (ctx) => {
        emit = ctx.emit;
        fail = ctx.fail;
        return () => {};
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });
    await runtime.start();

    emit!({ drafts: [draft({ source: 'stream' })], cursor: 'offset-1' });
    fail!(new Error('stream dropped'));
    await flush();

    const state = (await readSourceState('stream', instance))!;
    expect(state.failureStreak).toBe(1);
    expect(state.lastError).toContain('stream dropped');
    expect(state.cursor).toBe('offset-1');

    await runtime.stop();
  });

  it('refuses to attach a subscription on a null cursor when the cursor read failed', async () => {
    const real = db();
    const failing = new Set(['select']);
    const seen: (string | null)[] = [];
    const adapter: EventSourceAdapter = {
      source: 'stream',
      intervalMs: 1000,
      subscribe: (ctx) => {
        seen.push(ctx.cursor);
        return () => {};
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: faultyDb(real, failing) });

    await runtime.start();
    // Attaching on a null cursor would silently restart the stream at "now".
    expect(seen).toEqual([]);

    await vi.advanceTimersByTimeAsync(10_000);
    failing.clear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(seen).toHaveLength(1);

    await runtime.stop();
  });

  it('resumes the stored failure streak instead of starting the backoff over', async () => {
    const instance = db();
    await saveSourceState({ source: 'stream', failureStreak: 3, health: 'degraded' }, instance);
    let attaches = 0;
    const adapter: EventSourceAdapter = {
      source: 'stream',
      intervalMs: 1000,
      subscribe: () => {
        attaches += 1;
        throw new Error('handshake rejected');
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });

    await runtime.start();
    expect(attaches).toBe(1);
    expect((await readSourceState('stream', instance))!.failureStreak).toBe(4);

    // backoff(4, 1000) is 16s, so a restart must not be back to retrying every 2s.
    await vi.advanceTimersByTimeAsync(8000);
    expect(attaches).toBe(1);
    await vi.advanceTimersByTimeAsync(8000);
    expect(attaches).toBe(2);

    await runtime.stop();
  });

  it('treats an empty push as a heartbeat that clears the failure streak', async () => {
    const instance = db();
    await saveSourceState({ source: 'stream', failureStreak: 2, health: 'degraded' }, instance);
    let emit: ((result: EventPollResult) => void) | undefined;
    const adapter: EventSourceAdapter = {
      source: 'stream',
      intervalMs: 1000,
      subscribe: (ctx) => {
        emit = ctx.emit;
        return () => {};
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });
    await runtime.start();

    // Attaching alone only says "connected": it clears the error but not the streak.
    expect((await readSourceState('stream', instance))!).toMatchObject({
      health: 'active',
      failureStreak: 2,
      lastError: null,
    });

    emit!({ drafts: [] });
    await flush();
    expect((await readSourceState('stream', instance))!.failureStreak).toBe(0);

    await runtime.stop();
  });

  it('does not let a subscription that never finishes attaching block the other sources', async () => {
    const instance = db();
    const stuck: EventSourceAdapter = {
      source: 'stuck',
      intervalMs: 1000,
      subscribe: () => deferred<() => void>().promise,
    };
    const healthy = stubAdapter({ source: 'healthy', intervalMs: 1000 });
    const runtime = createEventRuntime({ adapters: [stuck, healthy], db: instance });

    let startResolved = false;
    void runtime.start().then(() => {
      startResolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(startResolved).toBe(true);
    expect(healthy.calls).toBe(1);

    await runtime.stop();
  });

  it('detaches a subscription that finishes attaching after stop', async () => {
    const instance = db();
    const gate = deferred<() => void>();
    let detached = false;
    const adapter: EventSourceAdapter = {
      source: 'stream',
      intervalMs: 1000,
      subscribe: () => gate.promise,
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });

    await runtime.start();
    await runtime.stop();
    expect(runtime.runningSources()).toEqual([]);

    gate.resolve(() => {
      detached = true;
    });
    await flush();
    expect(detached).toBe(true);
  });

  it('drops an attach that lands after the stream already reported a failure', async () => {
    const instance = db();
    const gates: { promise: Promise<() => void>; resolve: (v: () => void) => void }[] = [];
    const detaches: number[] = [];
    let attaches = 0;
    let fail: ((error: unknown) => void) | undefined;
    const adapter: EventSourceAdapter = {
      source: 'stream',
      intervalMs: 1000,
      subscribe: (ctx) => {
        attaches += 1;
        if (attaches === 1) fail = ctx.fail;
        const gate = deferred<() => void>();
        gates.push(gate);
        return gate.promise;
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });

    await runtime.start();
    expect(attaches).toBe(1);

    // The stream dies while its own handshake is still in flight.
    fail!(new Error('socket closed mid-handshake'));
    await flush();
    expect((await readSourceState('stream', instance))!.failureStreak).toBe(1);

    // The late handshake belongs to a generation nobody is waiting for any more.
    gates[0].resolve(() => detaches.push(1));
    await flush();
    expect(detaches).toEqual([1]);

    await vi.advanceTimersByTimeAsync(2000);
    expect(attaches).toBe(2);
    gates[1].resolve(() => detaches.push(2));
    await flush();
    expect(detaches).toEqual([1]);

    // Only the live generation is attached, so stop detaches exactly one stream.
    await runtime.stop();
    expect(detaches).toEqual([1, 2]);
  });

  it('ignores a push from a subscription generation that was already replaced', async () => {
    const instance = db();
    let staleEmit: ((result: EventPollResult) => void) | undefined;
    let attaches = 0;
    let fail: ((error: unknown) => void) | undefined;
    const adapter: EventSourceAdapter = {
      source: 'stream',
      intervalMs: 1000,
      subscribe: (ctx) => {
        attaches += 1;
        if (attaches === 1) {
          staleEmit = ctx.emit;
          fail = ctx.fail;
        }
        return () => {};
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });

    await runtime.start();
    fail!(new Error('socket closed'));
    await flush();
    await vi.advanceTimersByTimeAsync(2000);
    expect(attaches).toBe(2);

    staleEmit!({ drafts: [draft({ source: 'stream' })], cursor: 'stale-offset' });
    await flush();

    expect((await readSourceState('stream', instance))!.cursor).toBeNull();
    expect(await listEvents({ source: 'stream' }, instance)).toEqual([]);

    await runtime.stop();
  });

  it('serializes pollOnce with itself so a concurrent call cannot reuse a stale cursor', async () => {
    const instance = db();
    const cursorsSeen: (string | null)[] = [];
    let calls = 0;
    const adapter: EventSourceAdapter = {
      source: 'stub',
      intervalMs: 1000,
      poll: async ({ cursor }) => {
        cursorsSeen.push(cursor);
        calls += 1;
        return calls === 1
          ? { drafts: [draft(), draft({ kind: 'second' })], cursor: 'c1' }
          : { drafts: [], cursor: 'c2' };
      },
    };
    const runtime = createEventRuntime({ adapters: [adapter], db: instance });

    await Promise.all([runtime.pollOnce('stub'), runtime.pollOnce('stub')]);

    expect(cursorsSeen).toEqual([null, 'c1']);
    expect((await readSourceState('stub', instance))!.cursor).toBe('c2');
  });

  it('keeps rescheduling when the cursor read fails, and resumes once it recovers', async () => {
    const real = db();
    const failing = new Set(['select']);
    const adapter = stubAdapter({ intervalMs: 1000 });
    const runtime = createEventRuntime({
      adapters: [adapter],
      db: faultyDb(real, failing),
    });

    await runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    // Refuses to poll with an unknown cursor rather than re-downloading history.
    expect(adapter.calls).toBe(0);

    await vi.advanceTimersByTimeAsync(10_000);
    failing.clear();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(adapter.calls).toBeGreaterThan(0);
    expect((await readSourceState('stub', real))!.health).toBe('active');
    await runtime.stop();
  });

  it('keeps polling when every write fails, including the one recording the error', async () => {
    const real = db();
    const failing = new Set(['insert']);
    const adapter = stubAdapter({ intervalMs: 1000, result: () => ({ drafts: [draft()] }) });
    const runtime = createEventRuntime({
      adapters: [adapter],
      db: faultyDb(real, failing),
    });

    await runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(adapter.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(adapter.calls).toBeGreaterThanOrEqual(4);
    await runtime.stop();
  });

  it('keeps rescheduling when the ingest transaction fails, and recovers after', async () => {
    const real = db();
    const failing = new Set(['transaction']);
    const adapter = stubAdapter({ intervalMs: 1000, result: () => ({ drafts: [draft()] }) });
    const runtime = createEventRuntime({
      adapters: [adapter],
      db: faultyDb(real, failing),
    });

    await runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(6000);
    // Transactions are the shared primitive, so while they are down neither the
    // ingest nor the note about its failure can be written. The schedule still has
    // to survive on nothing but in-memory state.
    expect(adapter.calls).toBeGreaterThanOrEqual(2);
    expect(await readSourceState('stub', real)).toBeNull();

    failing.clear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await readSourceState('stub', real))!.health).toBe('active');
    expect(await listEvents({}, real)).toHaveLength(1);
    await runtime.stop();
  });

  it('reports per-source health for every known source', async () => {
    const instance = db();
    const runtime = createEventRuntime({
      adapters: [stubAdapter({ source: 'a' }), stubAdapter({ source: 'off', enabled: false })],
      db: instance,
    });
    await runtime.start();
    await vi.advanceTimersByTimeAsync(0);
    const health = await runtime.health();
    expect(health.map((h) => `${h.source}:${h.health}`).sort()).toEqual([
      'a:active',
      'off:disabled',
    ]);
    await runtime.stop();
  });
});
