import { useCallback, useEffect, useState } from 'react';
import type { EventCanvasPhase } from '@kansoku/core/contract/events';
import type { MarketEvent } from '@kansoku/shared/types';
import { client } from '@web/lib/client';
import { subscribeChannel } from '@web/lib/ws/wsHub';

interface CanvasEnvelope {
  type?: string;
  eventId?: string;
  slug?: string;
  phase?: EventCanvasPhase;
  error?: string | null;
}

export function useGenerateEventCanvas({ onOpen }: { onOpen: (slug: string) => void }) {
  const [phases, setPhases] = useState<Record<string, EventCanvasPhase>>({});

  useEffect(() => {
    return subscribeChannel(
      { kind: 'events' },
      (payload) => {
        const envelope = payload as CanvasEnvelope;
        if (envelope.type !== 'canvas' || !envelope.eventId || !envelope.phase) return;
        const eventId = envelope.eventId;
        const slug = envelope.slug;
        const phase = envelope.phase;
        setPhases((prev) => ({ ...prev, [eventId]: phase }));
        if (phase === 'done' && slug) onOpen(slug);
      },
      () => {},
    );
  }, [onOpen]);

  const phaseOf = useCallback((eventId: string) => phases[eventId] ?? null, [phases]);

  const onEventCanvas = useCallback(
    async (event: MarketEvent) => {
      const phase = phases[event.id];
      if (phase === 'queued' || phase === 'running') return;
      if (event.canvasSlug && phase !== 'failed') {
        onOpen(event.canvasSlug);
        return;
      }
      const job = await client.events.generateCanvas({ id: event.id });
      setPhases((prev) => ({ ...prev, [event.id]: job.phase }));
    },
    [onOpen, phases],
  );

  return { onEventCanvas, phaseOf, onOpenCanvas: onOpen };
}
