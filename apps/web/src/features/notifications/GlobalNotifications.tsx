import { useEffect, useRef } from 'react';
import type { CockpitComment, MarketEvent, Notice } from '@kansoku/shared/types';
import { maybeNotify, requestNotificationPermissionOnce } from '../../lib/notifications';
import { symbolFromRoute } from '../../lib/symbol';
import { useRoute } from '../../lib/router';
import { subscribeChannel } from '../../lib/ws/wsHub';

interface NotificationEnvelope {
  type: 'comment' | 'notice';
  comment?: CockpitComment;
  notice?: Notice;
}

interface EventEnvelope {
  type: 'init' | 'event' | 'status';
  events?: MarketEvent[];
  event?: MarketEvent;
}

const SEEN_CRITICAL_CAP = 200;

export const activeSymbolFromRoute = symbolFromRoute;

export function GlobalNotifications({ route }: { route: string }) {
  const activeSymbolRef = useRef<string | null>(activeSymbolFromRoute(route));
  activeSymbolRef.current = activeSymbolFromRoute(route);

  useEffect(() => {
    requestNotificationPermissionOnce();
    const seenCritical = new Set<string>();
    const offNotices = subscribeChannel(
      { kind: 'notifications' },
      (payload) => {
        const envelope = payload as NotificationEnvelope;
        if (envelope.type === 'comment' && envelope.comment) {
          const comment = envelope.comment;
          maybeNotify(
            {
              type: 'comment',
              live: true,
              symbol: comment.symbol,
              level: comment.level,
              text: comment.text,
            },
            activeSymbolRef.current,
          );
        } else if (envelope.type === 'notice' && envelope.notice) {
          maybeNotify(
            { type: 'notice', live: true, notice: envelope.notice },
            activeSymbolRef.current,
          );
        }
      },
      () => {},
    );
    const offEvents = subscribeChannel(
      { kind: 'events' },
      (payload) => {
        const envelope = payload as EventEnvelope;
        // The init snapshot is history the user can already see on the tape.
        if (envelope.type !== 'event' || !envelope.event) return;
        const event = envelope.event;
        if (event.severity !== 'critical') return;
        if (seenCritical.has(event.id)) return;
        if (seenCritical.size >= SEEN_CRITICAL_CAP) seenCritical.clear();
        seenCritical.add(event.id);
        maybeNotify(
          {
            type: 'event',
            live: true,
            id: event.id,
            title: event.payload.title,
            body: event.payload.summary ?? event.payload.title,
            symbols: event.symbols,
            severity: event.severity,
          },
          activeSymbolRef.current,
        );
      },
      () => {},
    );
    return () => {
      offNotices();
      offEvents();
    };
  }, []);

  return null;
}

export function RoutedGlobalNotifications() {
  return <GlobalNotifications route={useRoute()} />;
}
