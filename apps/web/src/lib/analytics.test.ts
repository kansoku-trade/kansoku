import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ANONYMOUS_ID_STORAGE_KEY,
  configureAnalytics,
  readAnonymousId,
  randomUuid,
  track,
  trackFeatureUsed,
  type AnalyticsTransportInput,
} from './analytics';
import { analyticsScreenOf } from './analyticsScreen';

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => map.delete(key),
    setItem: (key: string, value: string) => map.set(key, value),
  } as Storage;
}

function collect(): { sent: AnalyticsTransportInput[]; bodies: () => Record<string, unknown>[] } {
  const sent: AnalyticsTransportInput[] = [];
  configureAnalytics({
    endpoint: 'https://e.example.test/api/events',
    runtime: 'desktop',
    appVersion: '0.32.0',
    anonymousId: '11111111-1111-4111-8111-111111111111',
    eventId: () => '22222222-2222-4222-8222-222222222222',
    transport: (input) => sent.push(input),
  });
  return {
    sent,
    bodies: () => sent.map((input) => JSON.parse(input.body) as Record<string, unknown>),
  };
}

afterEach(() => {
  configureAnalytics({});
});

describe('track', () => {
  it('sends the five required fields the Worker validates', () => {
    const { bodies } = collect();

    track('app_opened', { entry: 'main' });

    expect(bodies()[0]).toEqual({
      id: '22222222-2222-4222-8222-222222222222',
      anonymous_id: '11111111-1111-4111-8111-111111111111',
      event_name: 'app_opened',
      app_version: '0.32.0',
      runtime: 'desktop',
      entry: 'main',
    });
  });

  it('omits dimensions that were not supplied rather than sending nulls', () => {
    const { bodies } = collect();

    trackFeatureUsed('ai_chat', { surface: 'chart' });

    const body = bodies()[0];
    expect(body.feature).toBe('ai_chat');
    expect(body.surface).toBe('chart');
    expect('stage' in body).toBe(false);
    expect('variant' in body).toBe(false);
  });

  // The Worker rejects any key outside its allowlist, so an extra field would fail the whole
  // event rather than being ignored.
  it('sends no key the ingest allowlist does not carry', () => {
    const allowed = new Set([
      'id',
      'anonymous_id',
      'event_name',
      'app_version',
      'runtime',
      'entry',
      'screen',
      'feature',
      'stage',
      'surface',
      'variant',
    ]);
    const { bodies } = collect();

    track('feature_used', {
      feature: 'chart_drawing',
      variant: 'fib',
      stage: 'completed',
      surface: 'chart',
      screen: 'chart',
      entry: 'main',
    });

    for (const key of Object.keys(bodies()[0])) expect(allowed.has(key)).toBe(true);
  });

  it('is inert when no endpoint is configured', () => {
    const sent: AnalyticsTransportInput[] = [];
    configureAnalytics({ endpoint: '', transport: (input) => sent.push(input) });

    track('app_opened', { entry: 'main' });

    expect(sent).toEqual([]);
  });

  it('never throws when the transport does', () => {
    configureAnalytics({
      endpoint: 'https://e.example.test/api/events',
      appVersion: '0.32.0',
      runtime: 'web',
      anonymousId: '11111111-1111-4111-8111-111111111111',
      transport: () => {
        throw new Error('network is down');
      },
    });

    expect(() => track('app_opened', { entry: 'main' })).not.toThrow();
  });
});

describe('readAnonymousId', () => {
  it('mints one on first read and reuses it afterwards', () => {
    const storage = memoryStorage();

    const first = readAnonymousId(storage);

    expect(first).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
    expect(storage.getItem(ANONYMOUS_ID_STORAGE_KEY)).toBe(first);
    expect(readAnonymousId(storage)).toBe(first);
  });

  it('still yields an id when storage is unavailable', () => {
    expect(readAnonymousId(null)).toMatch(/^[\da-f-]{36}$/i);
  });

  it('does not fail when storage throws', () => {
    const hostile = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: vi.fn(),
    } as unknown as Storage;

    expect(() => readAnonymousId(hostile)).not.toThrow();
  });
});

describe('randomUuid', () => {
  const V4 = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

  it('produces a v4 the Worker pattern accepts', () => {
    expect(randomUuid()).toMatch(V4);
  });

  // The ingest regex is strict about the version and variant nibbles, so the fallback path has to
  // set them itself rather than hand back 16 raw random bytes.
  it('still produces a valid v4 without crypto.randomUUID', () => {
    const original = crypto.randomUUID;
    Reflect.deleteProperty(crypto, 'randomUUID');
    try {
      const ids = Array.from({ length: 20 }, () => randomUuid());
      for (const id of ids) expect(id).toMatch(V4);
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});

describe('analyticsScreenOf', () => {
  it.each([
    ['/', 'home'],
    ['/overview', 'overview'],
    ['/charts', 'charts'],
    ['/charts/abc123', 'chart'],
    ['/symbol/NVDA', 'symbol'],
    ['/symbol/sepa/NVDA', 'sepa_symbol'],
    ['/popout/symbol/NVDA', 'symbol'],
    ['/research', 'research'],
    ['/chat', 'assistant'],
    ['/training/stats', 'training_stats'],
    ['/settings', 'settings'],
    ['/about', 'about'],
    ['/logs', 'logs'],
  ])('maps %s to %s', (path, screen) => {
    expect(analyticsScreenOf(path)).toBe(screen);
  });

  it('tolerates a trailing slash', () => {
    expect(analyticsScreenOf('/overview/')).toBe('overview');
  });

  it('falls back to other for anything unrouted', () => {
    expect(analyticsScreenOf('/nope')).toBe('other');
  });
});
