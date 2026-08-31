import { createContext, useContext, type ReactNode } from 'react';
import type { EventCanvasPhase } from '@kansoku/core/contract/events';
import type { MarketEvent } from '@kansoku/shared/types';
import { CanvasSplit } from '../canvas/CanvasSplit';
import { useCanvasWorkspace } from '../canvas/useCanvasWorkspace';
import { useGenerateEventCanvas } from './useGenerateEventCanvas';

export interface EventCanvasActions {
  onEventCanvas: (event: MarketEvent) => void | Promise<void>;
  onOpenCanvas: (slug: string) => void;
  phaseOf: (eventId: string) => EventCanvasPhase | null;
}

const EventCanvasActionsContext = createContext<EventCanvasActions | null>(null);

export function useEventCanvasActions(): EventCanvasActions | null {
  return useContext(EventCanvasActionsContext);
}

export function EventCanvasHost({ children }: { children: ReactNode }) {
  const canvas = useCanvasWorkspace();
  const generate = useGenerateEventCanvas({ onOpen: canvas.open });
  return (
    <EventCanvasActionsContext.Provider value={generate}>
      <CanvasSplit openSlug={canvas.openSlug} onClose={canvas.close}>
        {children}
      </CanvasSplit>
    </EventCanvasActionsContext.Provider>
  );
}
