import type { EventSourceState } from './types.js';
import { getDb, type Db } from '../db/index.js';
import type { EventPollResult, EventSourceAdapter } from './registry.js';
import { listEventAdapters } from './registry.js';
import {
  ingestEvent,
  listSourceStates,
  readSourceState,
  saveSourceState,
  type SourceStatePatch,
} from './store.js';

// One miss is a hiccup (a rate-limit window, a dropped connection). Two in a row is
// a story worth telling the user, so that is where "degraded" starts.
export const DEGRADE_AFTER_FAILURES = 2;
export const MAX_BACKOFF_MS = 15 * 60 * 1000;
// A subscription-only adapter has no polling cadence of its own; this is only the
// base delay for reconnect attempts.
const DEFAULT_RETRY_MS = 5000;

export function backoffDelayMs(failureStreak: number, intervalMs: number): number {
  if (failureStreak <= 0) return intervalMs;
  return Math.min(MAX_BACKOFF_MS, intervalMs * 2 ** failureStreak);
}

export interface PollOutcome {
  ingested: number;
  deduped: number;
}

export interface EventRuntime {
  start(): Promise<void>;
  stop(): Promise<void>;
  startSource(source: string): Promise<void>;
  stopSource(source: string): Promise<void>;
  runningSources(): string[];
  pollOnce(source: string): Promise<PollOutcome>;
  health(): Promise<EventSourceState[]>;
}

export interface EventRuntimeOptions {
  adapters?: EventSourceAdapter[];
  db?: Db;
}

interface RunningEntry {
  detach: (() => void) | null;
  timer: ReturnType<typeof setTimeout> | null;
  // Bumped for every attach attempt and every failure that retires one. A handshake
  // or a push belonging to an older generation is ignored, so a slow attach cannot
  // install itself on top of a newer subscription or a completed stop.
  generation: number;
}

const EMPTY: PollOutcome = { ingested: 0, deduped: 0 };

function retryBaseMs(adapter: EventSourceAdapter): number {
  return Number.isFinite(adapter.intervalMs) && adapter.intervalMs > 0
    ? adapter.intervalMs
    : DEFAULT_RETRY_MS;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createEventRuntime(options: EventRuntimeOptions = {}): EventRuntime {
  const db = options.db ?? getDb();
  const adapters = options.adapters ?? listEventAdapters();
  const running = new Map<string, RunningEntry>();
  // One chain per source: pushes are written in the order they arrived, so a slow
  // one cannot land after a newer one and reinstate its cursor.
  const queues = new Map<string, Promise<void>>();
  // Mirrors the stored streak. Scheduling reads this instead of the table so a
  // database outage cannot decide when the next attempt happens.
  const streaks = new Map<string, number>();
  // One controller per running source, so stopping it actually stops the request
  // rather than just stopping us from reading the answer.
  const controllers = new Map<string, AbortController>();
  // Bumped whenever a source is stopped or restarted. A poll that answers after its
  // generation was retired is discarded: on a hot reload the old collector's request
  // must not write a cursor the new one will then trust.
  const pollGenerations = new Map<string, number>();

  const enqueue = <T>(source: string, task: () => Promise<T>): Promise<T> => {
    const previous = queues.get(source) ?? Promise.resolve();
    const result = previous.then(task);
    queues.set(
      source,
      result.then(
        () => {},
        () => {},
      ),
    );
    return result;
  };

  const find = (source: string): EventSourceAdapter => {
    const adapter = adapters.find((a) => a.source === source);
    if (!adapter) throw new Error(`no event adapter registered for source ${source}`);
    return adapter;
  };

  const streakOf = (source: string): number => streaks.get(source) ?? 0;

  const saveStateSafely = async (patch: SourceStatePatch): Promise<void> => {
    try {
      await saveSourceState(patch, db);
    } catch {
      // The database is the thing that broke; losing the note about it must not
      // also lose the retry that follows.
    }
  };

  // Returns how long to wait before the next attempt, so the caller can schedule
  // even when the failure could not be written down.
  const recordFailure = async (
    adapter: EventSourceAdapter,
    error: unknown,
    touchPoll: boolean,
  ): Promise<number> => {
    const streak = streakOf(adapter.source) + 1;
    streaks.set(adapter.source, streak);
    const delay = backoffDelayMs(streak, retryBaseMs(adapter));
    await saveStateSafely({
      source: adapter.source,
      health: streak >= DEGRADE_AFTER_FAILURES ? 'degraded' : 'active',
      failureStreak: streak,
      lastError: messageOf(error),
      // On and failing is not off: a leftover "credential missing" next to a source
      // that is being polled sends the operator after a setting that is fine.
      disabledReason: null,
      nextAttemptAt: new Date(Date.now() + delay).toISOString(),
      ...(touchPoll ? { lastPolledAt: new Date().toISOString() } : {}),
    });
    return delay;
  };

  const ingest = async (
    source: string,
    result: EventPollResult,
    touchPoll: boolean,
  ): Promise<PollOutcome> => {
    let ingested = 0;
    let deduped = 0;
    let newestEventAt: string | null = null;
    for (const draft of result.drafts) {
      const { event, created } = await ingestEvent({ ...draft, source }, db);
      if (created) {
        ingested += 1;
        if (newestEventAt === null || event.occurredAt > newestEventAt) {
          newestEventAt = event.occurredAt;
        }
      } else {
        deduped += 1;
      }
    }
    // Deliberately not swallowed: a state write that fails has to degrade the
    // source, which is the caller's job.
    await saveSourceState(
      {
        source,
        ...(result.cursor !== undefined ? { cursor: result.cursor } : {}),
        ...(newestEventAt !== null ? { lastEventAt: newestEventAt } : {}),
        health: 'active',
        failureStreak: 0,
        lastError: null,
        // A source that just delivered is on, whatever it was switched off for before.
        disabledReason: null,
        nextAttemptAt: null,
        ...(touchPoll ? { lastPolledAt: new Date().toISOString() } : {}),
      },
      db,
    );
    streaks.set(source, 0);
    return { ingested, deduped };
  };

  // A disabled source keeps its reason on the record, so "off" in the UI can say
  // which credential is missing instead of looking like a silent failure.
  const markDisabled = (adapter: EventSourceAdapter): Promise<void> =>
    saveStateSafely({
      source: adapter.source,
      health: 'disabled',
      disabledReason: adapter.disabledReason ?? null,
      // Off on purpose is not a failure: leaving a stale error next to it would make
      // a deliberate switch look like a crash.
      lastError: null,
      failureStreak: 0,
      nextAttemptAt: null,
    });

  const runPoll = async (source: string): Promise<PollOutcome> => {
    const adapter = find(source);
    if (adapter.enabled === false) {
      await markDisabled(adapter);
      return EMPTY;
    }
    if (!adapter.poll) throw new Error(`event adapter ${source} is subscription-only`);

    let state: EventSourceState | null;
    try {
      state = await readSourceState(source, db);
    } catch (error) {
      // Polling with an unknown cursor would either re-download the whole history
      // or skip events outright, so this cycle waits for the database instead.
      await recordFailure(adapter, error, false);
      return EMPTY;
    }
    if (state) streaks.set(source, state.failureStreak);

    const generation = pollGenerations.get(source) ?? 0;
    const signal = controllers.get(source)?.signal;
    const current = (): boolean => (pollGenerations.get(source) ?? 0) === generation;
    try {
      const result = await adapter.poll({
        cursor: state?.cursor ?? null,
        ...(signal ? { signal } : {}),
      });
      // Stopped, or already restarted, while this cycle was in flight. Its cursor
      // describes a window the live source is no longer standing in.
      if (!current()) return EMPTY;
      return await ingest(source, result, true);
    } catch (error) {
      // A request we cancelled ourselves is not a source failure, and recording it as
      // one would leave a stopped source looking broken.
      if (!current()) return EMPTY;
      await recordFailure(adapter, error, true);
      return EMPTY;
    }
  };

  const scheduleAfter = (entry: RunningEntry, delay: number, run: () => void): void => {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      run();
    }, delay);
    // A pending poll must not be the reason a host refuses to exit: the collector
    // is a background chore, not work the process owes anyone. Optional because a
    // fake-timer handle in a test need not implement it.
    (entry.timer as { unref?: () => void }).unref?.();
  };

  const tick = async (adapter: EventSourceAdapter, entry: RunningEntry): Promise<void> => {
    if (running.get(adapter.source) !== entry) return;
    try {
      // Through the same queue as pushes and manual polls, so two cycles can never
      // be in flight at once and write each other's cursor back.
      await enqueue(adapter.source, () => runPoll(adapter.source));
    } catch {
      // pollOnce already wrote down whatever it could. Anything still escaping here
      // must not be the end of this source's schedule.
    }
    if (running.get(adapter.source) !== entry) return;
    scheduleAfter(entry, backoffDelayMs(streakOf(adapter.source), retryBaseMs(adapter)), () => {
      void tick(adapter, entry);
    });
  };

  const safeDetach = (detach: () => void): void => {
    try {
      detach();
    } catch {
      // A stream that throws on the way out is already gone.
    }
  };

  const dropSubscription = (entry: RunningEntry): void => {
    const detach = entry.detach;
    entry.detach = null;
    if (detach) safeDetach(detach);
  };

  const isCurrent = (source: string, entry: RunningEntry, generation: number): boolean =>
    running.get(source) === entry && entry.generation === generation;

  const handlePush = async (
    adapter: EventSourceAdapter,
    entry: RunningEntry,
    generation: number,
    result: EventPollResult,
  ): Promise<void> => {
    if (!isCurrent(adapter.source, entry, generation)) return;
    try {
      await ingest(adapter.source, result, false);
    } catch (error) {
      // The stream is fine, our side is not: degrade and say so, but do not tear
      // down a working subscription.
      await recordFailure(adapter, error, false);
    }
  };

  const retryAttach = async (
    adapter: EventSourceAdapter,
    entry: RunningEntry,
    generation: number,
    error: unknown,
  ): Promise<void> => {
    if (!isCurrent(adapter.source, entry, generation)) return;
    // Retire this generation first: a handshake still in flight for it must not
    // install itself on top of the reconnect scheduled below.
    entry.generation += 1;
    const delay = await recordFailure(adapter, error, false);
    dropSubscription(entry);
    if (running.get(adapter.source) !== entry) return;
    scheduleAfter(entry, delay, () => {
      void attach(adapter, entry);
    });
  };

  const attach = async (adapter: EventSourceAdapter, entry: RunningEntry): Promise<void> => {
    const source = adapter.source;
    if (running.get(source) !== entry) return;
    entry.generation += 1;
    const generation = entry.generation;

    let state: EventSourceState | null;
    try {
      state = await readSourceState(source, db);
    } catch (error) {
      // Attaching on a null cursor would quietly restart the stream at "now" and
      // lose everything that happened while we were away.
      await retryAttach(adapter, entry, generation, error);
      return;
    }
    if (!isCurrent(source, entry, generation)) return;
    // Picks the backoff up where the last run left it, instead of letting a restart
    // hammer a source that was already failing.
    if (state) streaks.set(source, state.failureStreak);

    let handshake: (() => void) | Promise<() => void>;
    try {
      handshake = adapter.subscribe!({
        cursor: state?.cursor ?? null,
        emit: (result) => {
          if (isCurrent(source, entry, generation)) {
            enqueue(source, () => handlePush(adapter, entry, generation, result));
          }
        },
        fail: (error) => {
          if (isCurrent(source, entry, generation)) {
            enqueue(source, () => retryAttach(adapter, entry, generation, error));
          }
        },
      });
    } catch (error) {
      await retryAttach(adapter, entry, generation, error);
      return;
    }

    // Deliberately not awaited: a handshake that never settles must not hold up
    // start() or the sources queued behind it.
    void Promise.resolve(handshake).then(
      async (detach) => {
        if (!isCurrent(source, entry, generation)) {
          // Superseded or stopped while the handshake was in flight.
          safeDetach(detach);
          return;
        }
        entry.detach = detach;
        // Connected, but not yet proven: only a delivered callback resets the
        // streak, so a stream that reconnects and drops again still escalates.
        await saveStateSafely({
          source,
          health: 'active',
          lastError: null,
          disabledReason: null,
          nextAttemptAt: null,
        });
      },
      (error: unknown) => retryAttach(adapter, entry, generation, error),
    );
  };

  const startSource = async (source: string): Promise<void> => {
    const adapter = find(source);
    if (running.has(source)) return;
    if (adapter.enabled === false) {
      await markDisabled(adapter);
      return;
    }
    const entry: RunningEntry = { detach: null, timer: null, generation: 0 };
    running.set(source, entry);
    pollGenerations.set(source, (pollGenerations.get(source) ?? 0) + 1);
    controllers.set(source, new AbortController());
    if (adapter.subscribe) {
      await attach(adapter, entry);
      return;
    }
    scheduleAfter(entry, 0, () => {
      void tick(adapter, entry);
    });
  };

  const stopSource = async (source: string): Promise<void> => {
    const entry = running.get(source);
    if (!entry) return;
    running.delete(source);
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    // Retire the generation before aborting: whatever the request does on its way out
    // must land on a cycle nobody is listening to any more.
    pollGenerations.set(source, (pollGenerations.get(source) ?? 0) + 1);
    controllers.get(source)?.abort();
    controllers.delete(source);
    dropSubscription(entry);
  };

  return {
    async start() {
      for (const adapter of adapters) {
        try {
          await startSource(adapter.source);
        } catch (error) {
          // One source that cannot even be set up is its own problem; the rest of
          // the fleet still starts.
          await saveStateSafely({
            source: adapter.source,
            health: 'degraded',
            lastError: messageOf(error),
            disabledReason: null,
          });
        }
      }
    },
    async stop() {
      const sources = [...running.keys()];
      for (const source of sources) await stopSource(source);
    },
    startSource,
    stopSource,
    runningSources() {
      return [...running.keys()];
    },
    pollOnce(source) {
      return enqueue(source, () => runPoll(source));
    },
    health() {
      return listSourceStates(db);
    },
  };
}
