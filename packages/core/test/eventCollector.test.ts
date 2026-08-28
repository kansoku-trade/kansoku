import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDb, type Db } from '../src/db/index.js';
import {
  activeEventCollector,
  buildDefaultEventAdapters,
  DEFAULT_EVENT_SOURCES,
  eventSourcesEnabled,
  startEventCollector,
  stopEventCollector,
} from '../src/events/collector.js';
import type { EventSourceAdapter } from '../src/events/registry.js';
import { listSourceStates, saveSourceState } from '../src/events/store.js';
import { BLS_SOURCE, FED_MONETARY_SOURCE, FED_PRESS_SOURCE } from '../src/events/sources/macroRss.js';
import { LONGBRIDGE_NEWS_SOURCE } from '../src/events/sources/longbridgeNews.js';
import { MARKET_CALENDAR_SOURCE } from '../src/events/sources/calendar.js';
import { SEC_SOURCE } from '../src/events/sources/sec.js';
import { KERNEL_TRIGGER_SOURCE } from '../src/events/sources/triggerBus.js';

const open: Db[] = [];

afterEach(async () => {
  await stopEventCollector();
  for (const instance of open.splice(0)) instance.$client.close();
});

function db(): Db {
  const instance = createDb(':memory:');
  open.push(instance);
  return instance;
}

function stub(source = 'stub'): EventSourceAdapter & { calls: number } {
  const adapter = {
    calls: 0,
    intervalMs: 50,
    poll: async () => {
      adapter.calls += 1;
      return { drafts: [] };
    },
    source,
  };
  return adapter;
}

function countTimeouts(): number {
  return process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout').length;
}

describe('event source master switch', () => {
  it('is on by default in a plain production environment', () => {
    expect(eventSourcesEnabled({ NODE_ENV: 'production' })).toBe(true);
    expect(eventSourcesEnabled({})).toBe(true);
  });

  it('is off whenever EVENT_SOURCES_DISABLED is set to anything truthy', () => {
    for (const value of ['1', 'true', 'yes', 'on']) {
      expect(eventSourcesEnabled({ EVENT_SOURCES_DISABLED: value })).toBe(false);
    }
  });

  it('ignores an explicit off value for the switch', () => {
    for (const value of ['0', 'false', '']) {
      expect(eventSourcesEnabled({ EVENT_SOURCES_DISABLED: value })).toBe(true);
    }
  });

  it('is off in a test environment, so no suite can reach the public internet', () => {
    expect(eventSourcesEnabled({ NODE_ENV: 'test' })).toBe(false);
    expect(eventSourcesEnabled({ VITEST: 'true' })).toBe(false);
  });
});

describe('default event source registration', () => {
  it('registers every P0/P1/P2 source exactly once', () => {
    const adapters = buildDefaultEventAdapters({ env: {} });

    expect(adapters.map((a) => a.source)).toEqual([
      LONGBRIDGE_NEWS_SOURCE,
      KERNEL_TRIGGER_SOURCE,
      MARKET_CALENDAR_SOURCE,
      SEC_SOURCE,
      FED_MONETARY_SOURCE,
      FED_PRESS_SOURCE,
      BLS_SOURCE,
    ]);
    expect(new Set(adapters.map((a) => a.source)).size).toBe(adapters.length);
  });

  it('names the default sources without constructing them', () => {
    expect([...DEFAULT_EVENT_SOURCES]).toEqual(
      buildDefaultEventAdapters({ env: {} }).map((a) => a.source),
    );
  });

  it('does not reach the network merely by being constructed', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      buildDefaultEventAdapters({ env: { SEC_USER_AGENT: 'Kansoku <dev@example.com>' } });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('keeps SEC off with a stated reason until SEC_USER_AGENT is configured', () => {
    const off = buildDefaultEventAdapters({ env: {} }).find((a) => a.source === SEC_SOURCE)!;
    expect(off.enabled).toBe(false);
    expect(off.disabledReason).toMatch(/SEC_USER_AGENT/);

    const on = buildDefaultEventAdapters({
      env: { SEC_USER_AGENT: 'Kansoku <dev@example.com>' },
    }).find((a) => a.source === SEC_SOURCE)!;
    expect(on.enabled).not.toBe(false);
  });

  it('gives every polling source a positive interval and SEC the 12s cadence', () => {
    const adapters = buildDefaultEventAdapters({
      env: { SEC_USER_AGENT: 'Kansoku <dev@example.com>' },
    });
    for (const adapter of adapters) expect(adapter.intervalMs).toBeGreaterThan(0);
    const sec = adapters.find((a) => a.source === SEC_SOURCE)!;
    expect(sec.intervalMs).toBeGreaterThanOrEqual(10_000);
    expect(sec.intervalMs).toBeLessThanOrEqual(15_000);
  });
});

describe('event collector singleton', () => {
  it('starts nothing and reports nothing running when the sources are switched off', async () => {
    const runtime = await startEventCollector({
      adapters: [stub()],
      db: db(),
      env: { EVENT_SOURCES_DISABLED: '1' },
    });

    expect(runtime).toBeNull();
    expect(activeEventCollector()).toBeNull();
  });

  it('starts nothing when called with no options from inside a test run', async () => {
    // No injected env: this is the real production entry point, and the guard has
    // to hold on the actual process environment, not on a test double.
    const runtime = await startEventCollector();

    expect(runtime).toBeNull();
    expect(activeEventCollector()).toBeNull();
  });

  it('refuses the default sources in a test run even when handed a clean env', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      // An injected env is how a caller configures the switch — it must not also be a
      // way to talk the guard out of the unconditional test-environment ban.
      const runtime = await startEventCollector({
        db: db(),
        env: { SEC_USER_AGENT: 'Kansoku <dev@example.com>' },
      });

      expect(runtime).toBeNull();
      expect(activeEventCollector()).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('writes every default source down as disabled when the master switch is off', async () => {
    const instance = db();
    // A source that was healthy before the switch was thrown must not be left
    // claiming to be active.
    await saveSourceState({ source: SEC_SOURCE, health: 'active' }, instance);

    const runtime = await startEventCollector({
      db: instance,
      env: { EVENT_SOURCES_DISABLED: '1' },
    });

    expect(runtime).toBeNull();
    const states = await listSourceStates(instance);
    expect(states.map((s) => s.source).sort()).toEqual([...DEFAULT_EVENT_SOURCES].sort());
    for (const state of states) {
      expect(state.health).toBe('disabled');
      expect(state.disabledReason).toMatch(/EVENT_SOURCES_DISABLED/);
    }
  });

  it('writes the injected sources down as disabled too', async () => {
    const instance = db();

    await startEventCollector({
      adapters: [stub('one'), stub('two')],
      db: instance,
      env: { EVENT_SOURCES_DISABLED: 'yes' },
    });

    const states = await listSourceStates(instance);
    expect(states.map((s) => s.source)).toEqual(['one', 'two']);
    for (const state of states) expect(state.health).toBe('disabled');
  });

  it('starts the registered sources once and hands the same runtime back on a second call', async () => {
    const adapter = stub();
    const instance = db();

    const first = await startEventCollector({ adapters: [adapter], db: instance, env: {} });
    const second = await startEventCollector({ adapters: [adapter], db: instance, env: {} });

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(activeEventCollector()).toBe(first);
    expect(first!.runningSources()).toEqual(['stub']);
  });

  it('stops every source and clears the singleton, and tolerates being stopped twice', async () => {
    const runtime = await startEventCollector({ adapters: [stub()], db: db(), env: {} });

    await stopEventCollector();
    expect(runtime!.runningSources()).toEqual([]);
    expect(activeEventCollector()).toBeNull();

    await expect(stopEventCollector()).resolves.toBeUndefined();
  });

  it('leaves nothing behind that would keep Node from exiting', async () => {
    const baseline = countTimeouts();

    await startEventCollector({ adapters: [stub()], db: db(), env: {} });
    expect(countTimeouts()).toBe(baseline);

    // Let the first cycle run and schedule the next one: the reschedule is a fresh
    // timer, and it has to be unref-ed too.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(countTimeouts()).toBe(baseline);

    await stopEventCollector();
    expect(countTimeouts()).toBe(baseline);
  });

  it('writes down a source that cannot start instead of failing the whole collector', async () => {
    const broken: EventSourceAdapter = {
      // Long enough that the scheduled reconnect cannot fire during the assertions.
      intervalMs: 60_000,
      source: 'broken',
      subscribe: () => {
        throw new Error('cannot attach');
      },
    };

    const runtime = await startEventCollector({
      adapters: [broken, stub()],
      db: db(),
      env: {},
    });

    expect(runtime!.runningSources()).toContain('stub');
    const state = (await runtime!.health()).find((s) => s.source === 'broken')!;
    expect(state.lastError).toBe('cannot attach');
    expect(state.failureStreak).toBe(1);
    // The first miss is a hiccup, not a story: what matters here is that it was
    // recorded and a retry is on the books, not that it already reads "degraded".
    expect(state.nextAttemptAt).not.toBeNull();
  });
});
