// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketEvent } from '@kansoku/shared/types';
import type { ChannelSpec } from '../../lib/ws/wsHub';
import type { NotifyEnvelope } from '../../lib/notifications';

const subs: { spec: ChannelSpec; onPayload: (payload: unknown) => void }[] = [];
const notifies: { env: NotifyEnvelope; symbol: string | null | undefined }[] = [];

vi.mock('../../lib/ws/wsHub', () => ({
  subscribeChannel: (
    spec: ChannelSpec,
    onPayload: (payload: unknown) => void,
    _onConnected: (connected: boolean) => void,
  ) => {
    subs.push({ spec, onPayload });
    return () => {};
  },
}));

vi.mock('../../lib/notifications', () => ({
  requestNotificationPermissionOnce: () => {},
  maybeNotify: (env: NotifyEnvelope, symbol?: string | null) => {
    notifies.push({ env, symbol });
  },
}));

const { GlobalNotifications } = await import('./GlobalNotifications');

function evt(over: Partial<MarketEvent> = {}): MarketEvent {
  return {
    id: 'evt-1',
    dedupeKey: 'k1',
    clusterId: 'c1',
    source: 'sec-edgar',
    class: 'filing',
    kind: '8-K',
    symbols: ['MU.US'],
    occurredAt: '2026-08-01T14:30:00.000Z',
    observedAt: '2026-08-01T14:31:00.000Z',
    trust: 'official',
    severity: 'critical',
    payload: { title: 'Micron 提交 8-K', summary: '新供货协议' },
    canvasSlug: null,
    ...over,
  };
}

function eventsHandler() {
  return subs.find((sub) => sub.spec.kind === 'events')?.onPayload;
}

beforeEach(() => {
  subs.length = 0;
  notifies.length = 0;
});

afterEach(() => cleanup());

describe('GlobalNotifications market events', () => {
  it('listens to the events channel on the existing hub', () => {
    render(<GlobalNotifications route="/" />);
    expect(subs.some((sub) => sub.spec.kind === 'notifications')).toBe(true);
    expect(subs.some((sub) => sub.spec.kind === 'events' && !('symbol' in sub.spec))).toBe(true);
  });

  it('notifies only live critical events, never the init snapshot', () => {
    render(<GlobalNotifications route="/" />);
    const onPayload = eventsHandler();
    onPayload?.({ type: 'init', events: [evt()] });
    onPayload?.({ type: 'event', event: evt({ id: 'info', severity: 'info' }) });
    onPayload?.({ type: 'event', event: evt({ id: 'note', severity: 'notable' }) });
    onPayload?.({ type: 'event', event: evt() });
    expect(notifies).toHaveLength(1);
    expect(notifies[0].env).toMatchObject({
      type: 'event',
      live: true,
      id: 'evt-1',
      title: 'Micron 提交 8-K',
      severity: 'critical',
    });
  });

  it('does not notify a second time when the same event id is resent after clustering', () => {
    render(<GlobalNotifications route="/" />);
    const onPayload = eventsHandler();
    onPayload?.({ type: 'event', event: evt() });
    onPayload?.({
      type: 'event',
      event: evt({ clusterId: 'merged', symbols: ['MU.US', 'NVDA.US'] }),
    });
    expect(notifies).toHaveLength(1);
  });
});
