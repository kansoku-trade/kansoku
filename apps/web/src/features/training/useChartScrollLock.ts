import { useEffect } from 'react';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';

// The single writer of the trainer chart's pan/zoom flags. Both the order placement drag and the
// drawing tools start their gesture anywhere on the canvas, so lightweight-charts would otherwise
// scroll the series out from under the press — but if each locked for itself, whichever detached
// last would hand panning back while the other was still armed. applyOptions throws on an
// already-disposed chart, which is reachable on unmount.
export function useChartScrollLock(handle: DrawingChartHandle | null, locked: boolean): void {
  useEffect(() => {
    if (!handle || !locked) return;
    const apply = (enabled: boolean) => {
      try {
        handle.chart.applyOptions({ handleScroll: enabled, handleScale: enabled });
      } catch {
        return;
      }
    };
    apply(false);
    return () => apply(true);
  }, [handle, locked]);
}
