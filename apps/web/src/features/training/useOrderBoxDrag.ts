import { useEffect, useRef } from 'react';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';
import { beginCursorLock, endCursorLock } from './cursorLock';

export interface OrderBoxDragSnapshot {
  stop: number;
  target1: number;
}

export interface OrderBoxDragCallbacks {
  onStopDrag: (price: number) => void;
  onTargetDrag: (price: number) => void;
  onDragEnd?: () => void;
}

const EDGE_HIT_PX = 6;

type DragEdge = 'stop' | 'target';

export function useOrderBoxDrag(
  handle: DrawingChartHandle | null,
  snapshot: OrderBoxDragSnapshot,
  callbacks: OrderBoxDragCallbacks,
): void {
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!handle) return;
    const { series, container } = handle;
    let dragEdge: DragEdge | null = null;

    const onPointerDown = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const yStop = series.priceToCoordinate(snapshotRef.current.stop);
      const yTarget = series.priceToCoordinate(snapshotRef.current.target1);
      const distStop = yStop === null ? Infinity : Math.abs(y - yStop);
      const distTarget = yTarget === null ? Infinity : Math.abs(y - yTarget);
      if (distStop > EDGE_HIT_PX && distTarget > EDGE_HIT_PX) return;
      dragEdge = distStop <= distTarget ? 'stop' : 'target';
      // Same reason as the ticket handles: once the pointer leaves the few pixels around the line,
      // the cursor would revert to the chart's own and the grab would stop looking like a grab.
      beginCursorLock();
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragEdge) return;
      const rect = container.getBoundingClientRect();
      const price = series.coordinateToPrice(e.clientY - rect.top);
      if (price === null) return;
      if (dragEdge === 'stop') callbacksRef.current.onStopDrag(price);
      else callbacksRef.current.onTargetDrag(price);
    };

    const onPointerUp = () => {
      if (!dragEdge) return;
      dragEdge = null;
      endCursorLock();
      callbacksRef.current.onDragEnd?.();
    };

    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      // A handle swap or an unmount mid-drag must not leave the lock held.
      if (dragEdge) endCursorLock();
    };
  }, [handle]);
}
