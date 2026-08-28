import type { HomeEventItem } from '@kansoku/shared/types';
import type { HomeEventsRead } from '../../overview/homeEvents.js';
import type { EventPollResult, EventSourceAdapter } from '../registry.js';
import type { MarketEventDraft } from '../types.js';
import { dateOnlyInstant } from './instants.js';

export const MARKET_CALENDAR_SOURCE = 'market-calendar';

// Earnings dates and macro prints move on the scale of hours, so a tighter cadence
// would only re-download the same window.
const DEFAULT_INTERVAL_MS = 5 * 60_000;

const ACTUAL_PLACEHOLDERS = new Set(['', '-', '--', '—', 'n/a']);

export interface CalendarAdapterDeps {
  // The strict read: it throws when every upstream call failed, so "the broker is
  // down" degrades this source instead of looking like a quiet week.
  loadHomeEvents: () => Promise<HomeEventsRead>;
  // Where dropped rows and partial upstream failures are reported. A row we discard
  // for having no identity has to be visible somewhere, or the calendar just looks
  // short.
  onDiagnostic?: (note: string) => void;
  intervalMs?: number;
}

interface Placed {
  occurredAt: string;
  // Whether the calendar actually knew a time, or we placed the row on its date.
  precision: 'instant' | 'date';
}

function placeInTime(item: HomeEventItem): Placed | null {
  if (item.ts) {
    const at = Date.parse(item.ts);
    if (Number.isFinite(at)) return { occurredAt: new Date(at).toISOString(), precision: 'instant' };
  }
  const dateOnly = item.date ? dateOnlyInstant(item.date) : null;
  return dateOnly ? { occurredAt: dateOnly, precision: 'date' } : null;
}

function printed(actual: string | null): string | null {
  if (actual === null) return null;
  const text = actual.trim();
  return ACTUAL_PLACEHOLDERS.has(text.toLowerCase()) ? null : text;
}

function stableId(item: HomeEventItem): string | null {
  return item.sourceId?.trim() || null;
}

interface Conversion {
  draft?: MarketEventDraft;
  note?: string;
}

function toDraft(item: HomeEventItem): Conversion {
  const placed = placeInTime(item);
  // A row we cannot place in time cannot be a timeline event, and inventing a date
  // for it would put a fabricated catalyst in front of the user.
  if (!placed) return { note: `dropped a ${item.kind} row with no usable date: ${item.title}` };
  const { occurredAt, precision } = placed;
  const id = stableId(item);

  if (item.kind === 'earnings') {
    // The provider's own id wins when there is one; otherwise symbol plus report date
    // is stable in its own right, which the title is not.
    if (!id && !item.symbol) {
      return { note: `dropped an earnings row with neither an id nor a symbol: ${item.title}` };
    }
    const symbol = item.symbol?.trim().toUpperCase() ?? '';
    return {
      draft: {
        class: 'earnings',
        dedupeKey: id ? `earnings|${id}` : `earnings|${symbol}|${item.date}`,
        kind: 'earnings_scheduled',
        occurredAt,
        payload: {
          data: { date: item.date, datePrecision: precision, owned: item.owned },
          title: item.title,
        },
        severity: 'notable',
        source: MARKET_CALENDAR_SOURCE,
        symbols: symbol ? [symbol] : [],
        trust: 'official',
      },
    };
  }

  // A macro row has no symbol and no date that is unique to it, so without the
  // provider's id there is nothing to recognize it by later. The title is not a
  // candidate: the calendar splices the estimate and then the actual into it, and
  // keying on the instant alone would let two prints at 8:30 overwrite each other.
  if (!id) {
    return { note: `dropped a macro row with no provider id: ${item.title} @ ${occurredAt}` };
  }

  const actual = printed(item.actual);
  const released = actual !== null;
  const symbols = item.symbol ? [item.symbol.trim().toUpperCase()] : [];
  return {
    draft: {
      class: 'macro',
      // Scheduled and released are two facts about the same slot, not one row that
      // mutates: the print is what moves the tape, so it gets its own event.
      dedupeKey: `macro|${released ? 'released' : 'scheduled'}|${id}`,
      kind: released ? 'macro_released' : 'macro_scheduled',
      occurredAt,
      payload: {
        data: {
          ...(actual !== null ? { actual } : {}),
          date: item.date,
          datePrecision: precision,
          estimate: item.estimate,
          previous: item.previous,
          sourceId: id,
        },
        title: item.title,
      },
      severity: released ? 'notable' : 'info',
      source: MARKET_CALENDAR_SOURCE,
      symbols,
      trust: 'official',
    },
  };
}

export function createCalendarAdapter(deps: CalendarAdapterDeps): EventSourceAdapter {
  const report =
    deps.onDiagnostic ??
    ((note: string) => {
      console.warn(`[${MARKET_CALENDAR_SOURCE}] ${note}`);
    });

  async function poll(): Promise<EventPollResult> {
    const home = await deps.loadHomeEvents();
    // Partial failures still ingest what arrived, but they are not silent: a calendar
    // missing half its markets should not read as a calm week.
    for (const failure of home.failures) report(`upstream partly unavailable — ${failure}`);

    const byKey = new Map<string, MarketEventDraft>();
    for (const item of home.events.items) {
      const { draft, note } = toDraft(item);
      if (note) report(note);
      if (draft) byKey.set(draft.dedupeKey!, draft);
    }
    // No cursor: every cycle re-reads the whole forward window, and the domain's
    // dedupe on these keys is what keeps that from being noise.
    return { drafts: [...byKey.values()] };
  }

  return {
    intervalMs: deps.intervalMs ?? DEFAULT_INTERVAL_MS,
    poll,
    source: MARKET_CALENDAR_SOURCE,
  };
}
