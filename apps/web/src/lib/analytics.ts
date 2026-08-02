import { getShellRpc } from '@web/features/desktop/shellRpc';

/**
 * Mirrors the ingest contract of the kansoku-analytics Worker (`src/event.ts` there). Every field
 * is an enum it validates against and rejects the whole event on mismatch, so these unions are the
 * contract, not a convenience — widening one here without widening it there produces a 400 that
 * nothing surfaces, because delivery is deliberately silent.
 */
export type AnalyticsEventName = 'app_opened' | 'screen_viewed' | 'feature_used';
export type AnalyticsRuntime = 'desktop' | 'web';
export type AnalyticsEntry = 'main' | 'trainer';

export type AnalyticsScreen =
  | 'home'
  | 'overview'
  | 'charts'
  | 'chart'
  | 'symbol'
  | 'sepa_symbol'
  | 'research'
  | 'assistant'
  | 'training_stats'
  | 'settings'
  | 'about'
  | 'logs'
  | 'other';

export type AnalyticsFeature =
  | 'onboarding'
  | 'market_analysis'
  | 'deep_research'
  | 'ai_chat'
  | 'research_create'
  | 'chart_drawing'
  | 'training_session';

export type AnalyticsStage = 'started' | 'completed';
export type AnalyticsSurface = 'chart' | 'research' | 'assistant';
export type AnalyticsVariant =
  | 'stock'
  | 'journal'
  | 'hline'
  | 'trendline'
  | 'rect'
  | 'fib'
  | 'polyline';

interface AnalyticsDimensions {
  entry?: AnalyticsEntry;
  screen?: AnalyticsScreen;
  feature?: AnalyticsFeature;
  stage?: AnalyticsStage;
  surface?: AnalyticsSurface;
  variant?: AnalyticsVariant;
}

export const ANONYMOUS_ID_STORAGE_KEY = 'trade.analytics.anonymous-id';

/**
 * `crypto.randomUUID` needs a secure context. The desktop app has one — `app://` is registered
 * privileged with `secure: true` — but the whole module is fire-and-forget, so a context that
 * lacks it would report nothing and say nothing. The fallback keeps that from being a silent
 * outage; the Worker validates the shape, so it has to be a real v4.
 */
export function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0F) | 0x40;
  bytes[8] = (bytes[8] & 0x3F) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The device identity, and the only thing about the sender that is stored. It is a random UUID
 * minted on first send and never derived from anything on the machine, so it identifies a browser
 * profile and nothing else — clearing site data makes a new device, which is the intended contract.
 */
export function readAnonymousId(storage: Storage | null = browserStorage()): string {
  const fresh = randomUuid();
  if (!storage) return fresh;
  try {
    const stored = storage.getItem(ANONYMOUS_ID_STORAGE_KEY);
    if (stored) return stored;
    storage.setItem(ANONYMOUS_ID_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return fresh;
  }
}

export interface AnalyticsTransportInput {
  endpoint: string;
  body: string;
}

function post({ endpoint, body }: AnalyticsTransportInput): void {
  // keepalive so an event fired as the window closes still leaves; the response is never read,
  // and a rejection is swallowed by design — see `track`.
  void fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export interface AnalyticsDeps {
  endpoint?: string;
  runtime?: AnalyticsRuntime;
  appVersion?: string;
  anonymousId?: string;
  eventId?: () => string;
  transport?: (input: AnalyticsTransportInput) => void;
}

let deps: AnalyticsDeps = {};

export function configureAnalytics(next: AnalyticsDeps): void {
  deps = next;
}

function endpointOf(): string | null {
  if (deps.endpoint !== undefined) return deps.endpoint || null;
  const configured = import.meta.env.VITE_ANALYTICS_ENDPOINT;
  return typeof configured === 'string' && configured.length > 0 ? configured : null;
}

function runtimeOf(): AnalyticsRuntime {
  return deps.runtime ?? (getShellRpc() !== null ? 'desktop' : 'web');
}

/**
 * Fire-and-forget by design: analytics must never fail a user action, so nothing here throws,
 * awaits, or reports. With no endpoint configured the whole module is inert, which is what a
 * development build and a self-hosted build both get.
 */
export function track(name: AnalyticsEventName, dimensions: AnalyticsDimensions = {}): void {
  const endpoint = endpointOf();
  if (!endpoint) return;
  try {
    const body = JSON.stringify({
      id: (deps.eventId ?? randomUuid)(),
      anonymous_id: deps.anonymousId ?? readAnonymousId(),
      event_name: name,
      app_version: deps.appVersion ?? __APP_VERSION__,
      runtime: runtimeOf(),
      ...dimensions,
    });
    (deps.transport ?? post)({ endpoint, body });
  } catch {
    // A failure to even assemble the event is still not the user's problem.
  }
}

export function trackAppOpened(entry: AnalyticsEntry): void {
  track('app_opened', { entry });
}

export function trackScreenViewed(screen: AnalyticsScreen): void {
  track('screen_viewed', { screen });
}

export function trackFeatureUsed(
  feature: AnalyticsFeature,
  dimensions: Omit<AnalyticsDimensions, 'feature' | 'entry' | 'screen'> = {},
): void {
  track('feature_used', { feature, ...dimensions });
}
