import type { MarketEventClass } from '@kansoku/shared/types';
import { ClientError } from '../platform/errors.js';
import { normalizeSymbol } from '../symbols/symbol.utils.js';

export const DEFAULT_EVENT_LIST_LIMIT = 200;
// A feed page, not a table dump: the timeline renders 50 at a time and the widest
// caller (a canvas backfill) asks for a few hundred.
export const MAX_EVENT_LIST_LIMIT = 500;

const EVENT_CLASSES: MarketEventClass[] = [
  'macro',
  'earnings',
  'filing',
  'news',
  'policy',
  'flow',
  'technical',
];

// An instant, not a date: occurredAt is compared as text, so anything without a
// time and a zone would silently mean midnight UTC.
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

export interface RawEventListInput {
  symbol?: unknown;
  source?: unknown;
  class?: unknown;
  since?: unknown;
  before?: unknown;
  beforeId?: unknown;
  limit?: unknown;
}

export interface NormalizedEventListInput {
  symbol?: string;
  source?: string;
  class?: MarketEventClass;
  since?: string;
  before?: string;
  beforeId?: string;
  limit: number;
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new ClientError(`invalid ${field}`, 'expected a string');
  }
  const text = value.trim();
  return text === '' ? undefined : text;
}

function parseInstant(value: unknown, field: string): string | undefined {
  const text = optionalText(value, field);
  if (text === undefined) return undefined;
  const at = Date.parse(text);
  if (!ISO_INSTANT_RE.test(text) || !Number.isFinite(at)) {
    throw new ClientError(`invalid ${field}`, 'expected an ISO instant, e.g. 2026-08-20T13:00:00Z');
  }
  return new Date(at).toISOString();
}

function parseLimit(value: unknown): number {
  if (value === undefined || value === null || value === '') return DEFAULT_EVENT_LIST_LIMIT;
  const limit = typeof value === 'number' ? value : Number(optionalText(value, 'limit'));
  if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_EVENT_LIST_LIMIT) {
    throw new ClientError(
      'invalid limit',
      `expected an integer between 1 and ${MAX_EVENT_LIST_LIMIT}`,
    );
  }
  return limit;
}

function parseClass(value: unknown): MarketEventClass | undefined {
  const text = optionalText(value, 'class');
  if (text === undefined) return undefined;
  if (!(EVENT_CLASSES as string[]).includes(text)) {
    throw new ClientError('invalid event class', `expected one of ${EVENT_CLASSES.join(', ')}`);
  }
  return text as MarketEventClass;
}

// One gate for both transports: the HTTP controller and the desktop IPC service
// hand their raw input straight to this, so a query string and an IPC payload are
// accepted or refused on identical terms.
export function normalizeEventListInput(raw: RawEventListInput = {}): NormalizedEventListInput {
  const symbol = optionalText(raw.symbol, 'symbol');
  const source = optionalText(raw.source, 'source');
  const eventClass = parseClass(raw.class);
  const since = parseInstant(raw.since, 'since');
  const before = parseInstant(raw.before, 'before');
  const beforeId = optionalText(raw.beforeId, 'beforeId');
  if (beforeId !== undefined && before === undefined) {
    throw new ClientError('invalid beforeId', 'beforeId only makes sense together with before');
  }
  return {
    // normalizeSymbol both qualifies a bare ticker and refuses anything outside
    // [A-Z0-9.], which is what keeps a LIKE wildcard out of the query.
    ...(symbol !== undefined ? { symbol: normalizeSymbol(symbol) } : {}),
    ...(source !== undefined ? { source } : {}),
    ...(eventClass !== undefined ? { class: eventClass } : {}),
    ...(since !== undefined ? { since } : {}),
    ...(before !== undefined ? { before } : {}),
    ...(beforeId !== undefined ? { beforeId } : {}),
    limit: parseLimit(raw.limit),
  };
}
