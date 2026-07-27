import { useEffect, useRef } from 'react';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';

export interface OrderPlacementCallbacks {
  onPreview: (stop: number, target: number) => void;
  onCommit: (stop: number, target: number) => void;
}

export function useOrderPlacementDrag(
  handle: DrawingChartHandle | null,
  armed: boolean,
  callbacks: OrderPlacementCallbacks,
): void {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (!handle || !armed) return;
    const { chart, series, container } = handle;
    let stop: number | null = null;

    const priceAt = (clientY: number) =>
      series.coordinateToPrice(clientY - container.getBoundingClientRect().top);

    const onPointerDown = (e: PointerEvent) => {
      const price = priceAt(e.clientY);
      if (price === null) return;
      stop = price;
      callbacksRef.current.onPreview(price, price);
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (stop === null) return;
      const price = priceAt(e.clientY);
      if (price === null) return;
      callbacksRef.current.onPreview(stop, price);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (stop === null) return;
      const pressed = stop;
      stop = null;
      callbacksRef.current.onCommit(pressed, priceAt(e.clientY) ?? pressed);
    };

    // Panning is off for the whole armed window, not just the drag itself: this gesture starts
    // anywhere on the canvas, so lightweight-charts would otherwise scroll the series out from
    // under the press. Same lock useDrawings applies while a drawing tool is armed. applyOptions
    // throws on an already-disposed chart, which is reachable on unmount.
    const lockScroll = (locked: boolean) => {
      try {
        chart.applyOptions({ handleScroll: !locked, handleScale: !locked });
      } catch {
        return;
      }
    };

    lockScroll(true);
    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      lockScroll(false);
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [handle, armed]);
}
