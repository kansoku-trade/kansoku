import type { Db } from '../db/index.js';
import { buildHomeEventsStrict } from '../overview/homeEvents.js';
import { getWatchSymbolsStrict } from '../overview/homeExtras.js';
import { getProvider } from '../marketdata/registry.js';
import type { EventSourceAdapter } from './registry.js';
import { createEventRuntime, type EventRuntime } from './runtime.js';
import { saveSourceState } from './store.js';
import { createCalendarAdapter, MARKET_CALENDAR_SOURCE } from './sources/calendar.js';
import { createLongbridgeNewsAdapter, LONGBRIDGE_NEWS_SOURCE } from './sources/longbridgeNews.js';
import {
  BLS_SOURCE,
  createBlsRssAdapter,
  createFedMonetaryAdapter,
  createFedPressAdapter,
  FED_MONETARY_SOURCE,
  FED_PRESS_SOURCE,
} from './sources/macroRss.js';
import { createSecAdapter, SEC_SOURCE } from './sources/sec.js';
import { createTriggerAdapter, KERNEL_TRIGGER_SOURCE } from './sources/triggerBus.js';

const OFF_VALUES = new Set(['', '0', 'false', 'no', 'off']);

const DISABLED_BY_SWITCH = 'EVENT_SOURCES_DISABLED is set';

// Read off the real process, never off an injected env: the injected one exists so a
// caller can configure the switch, and it must not double as a way to talk the
// unconditional ban out of a test process.
function insideTestRun(): boolean {
  return process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
}

// One switch that turns every external source off, plus an unconditional block in
// any test environment: a suite that quietly reaches the SEC or the Fed is both a
// flaky test and a fair-access violation.
export function eventSourcesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'test' || env.VITEST) return false;
  const flag = env.EVENT_SOURCES_DISABLED;
  if (flag === undefined) return true;
  return OFF_VALUES.has(flag.trim().toLowerCase());
}

export interface DefaultAdapterOptions {
  env?: NodeJS.ProcessEnv;
}

// Named separately from the builder so the switch can write every default source down
// as disabled without constructing adapters that would then need tearing down.
export const DEFAULT_EVENT_SOURCES = [
  LONGBRIDGE_NEWS_SOURCE,
  KERNEL_TRIGGER_SOURCE,
  MARKET_CALENDAR_SOURCE,
  SEC_SOURCE,
  FED_MONETARY_SOURCE,
  FED_PRESS_SOURCE,
  BLS_SOURCE,
] as const;

// The production source list. Every dependency is passed in explicitly, so the
// only thing that decides whether a source can be reached is this function.
export function buildDefaultEventAdapters(
  options: DefaultAdapterOptions = {},
): EventSourceAdapter[] {
  const env = options.env ?? process.env;
  return [
    createLongbridgeNewsAdapter({
      // The strict read when the provider has one: a collector must be able to tell
      // "no headlines" from "the broker never answered".
      getNews: (symbol, limit) => {
        const provider = getProvider();
        return provider.getNewsStrict
          ? provider.getNewsStrict(symbol, limit)
          : provider.getNews(symbol, limit);
      },
      symbols: getWatchSymbolsStrict,
    }),
    createTriggerAdapter(),
    createCalendarAdapter({ loadHomeEvents: () => buildHomeEventsStrict() }),
    // No default identity: SEC requires a real contact, and faking one would get
    // every user of this app blocked rather than just this source.
    createSecAdapter({ symbols: getWatchSymbolsStrict, userAgent: env.SEC_USER_AGENT ?? null }),
    createFedMonetaryAdapter(),
    createFedPressAdapter(),
    createBlsRssAdapter(),
  ];
}

export interface EventCollectorOptions {
  adapters?: EventSourceAdapter[];
  db?: Db;
  env?: NodeJS.ProcessEnv;
}

let collector: EventRuntime | null = null;
// Guards against two hosts (or two boot phases) racing to start: without it the
// second caller would build a second runtime and double every source's cadence.
let starting: Promise<EventRuntime | null> | null = null;

export function activeEventCollector(): EventRuntime | null {
  return collector;
}

function switchedOff(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.EVENT_SOURCES_DISABLED;
  return flag !== undefined && !OFF_VALUES.has(flag.trim().toLowerCase());
}

async function recordDisabled(options: EventCollectorOptions): Promise<void> {
  const sources = options.adapters
    ? options.adapters.map((adapter) => adapter.source)
    : [...DEFAULT_EVENT_SOURCES];
  for (const source of sources) {
    try {
      await saveSourceState(
        {
          source,
          health: 'disabled',
          disabledReason: DISABLED_BY_SWITCH,
          lastError: null,
          failureStreak: 0,
          nextAttemptAt: null,
        },
        ...(options.db ? ([options.db] as const) : ([] as const)),
      );
    } catch {
      // Best effort. Recording why nothing is running must not be the reason a host
      // fails to boot.
    }
  }
}

export async function startEventCollector(
  options: EventCollectorOptions = {},
): Promise<EventRuntime | null> {
  if (collector) return collector;
  if (starting) return starting;
  // Deliberately switched off, which is a decision worth writing down: a source that
  // was active before the switch was thrown would otherwise keep claiming to be live
  // in the UI forever. A test environment is not that decision, and recording it
  // there would only mean a suite dirtying the default database.
  if (switchedOff(options.env)) {
    await recordDisabled(options);
    return null;
  }
  // The default sources are the ones that reach the public internet, so a test
  // process may never build them — whatever env it hands us.
  if (!options.adapters && insideTestRun()) return null;
  if (!eventSourcesEnabled(options.env)) return null;

  starting = (async () => {
    const runtime = createEventRuntime({
      adapters:
        options.adapters ??
        buildDefaultEventAdapters({ ...(options.env ? { env: options.env } : {}) }),
      ...(options.db ? { db: options.db } : {}),
    });
    // start() already isolates a source that cannot be set up, so one broken
    // adapter degrades itself rather than leaving the host with no collector.
    await runtime.start();
    collector = runtime;
    return runtime;
  })();

  try {
    return await starting;
  } finally {
    starting = null;
  }
}

export async function stopEventCollector(): Promise<void> {
  const pending = starting;
  // A stop that lands mid-start has to wait for it, or the runtime it created
  // would keep polling with nobody holding a reference to stop it.
  if (pending) await pending.catch(() => null);
  const runtime = collector;
  collector = null;
  if (runtime) await runtime.stop();
}
