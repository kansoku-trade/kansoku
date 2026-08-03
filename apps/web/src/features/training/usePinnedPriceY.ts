import { useLayoutEffect, useState } from 'react';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';

export interface PinnedPrices {
  target: number | null;
  entry: number | null;
  stop: number | null;
}

type PinnedYs = { [K in keyof PinnedPrices]: number | null };

// The candle pane's own rectangle, in the same frame coordinates as the ys: the price axis and the
// MACD chart below sit outside it, and anything grabbable has to stop at its edges.
export interface PinnedPane {
  left: number;
  width: number;
  top: number;
  bottom: number;
}

export interface PinnedLevels {
  ys: PinnedYs;
  pane: PinnedPane | null;
}

const NOTHING: PinnedLevels = {
  ys: { target: null, entry: null, stop: null },
  pane: null,
};

function sameYs(a: PinnedYs, b: PinnedYs): boolean {
  return a.target === b.target && a.entry === b.entry && a.stop === b.stop;
}

function samePane(a: PinnedPane | null, b: PinnedPane | null): boolean {
  if (a === null || b === null) return a === b;
  return a.left === b.left && a.width === b.width && a.top === b.top && a.bottom === b.bottom;
}

function same(a: PinnedLevels, b: PinnedLevels): boolean {
  return sameYs(a.ys, b.ys) && samePane(a.pane, b.pane);
}

// lightweight-charts emits no event when the price scale rescales — autoscale runs during its own
// paint — so anything pinned to a price has to re-measure per frame to stay on its line while the
// chart pans, zooms or refits. One loop covers all three levels; it stops as soon as every price is
// null, which is whenever there is no order and no position.
export function usePinnedPriceYs(
  handle: DrawingChartHandle | null,
  frame: HTMLElement | null,
  prices: PinnedPrices,
): PinnedLevels {
  const [pinned, setPinned] = useState<PinnedLevels>(NOTHING);
  const { target, entry, stop } = prices;

  // Layout effect, not a plain effect: the first measurement lands in the same commit as the pills
  // it positions, so they never paint one frame at the wrong price.
  useLayoutEffect(() => {
    const live = target !== null || entry !== null || stop !== null;
    if (!handle || !frame || !live) {
      setPinned((prev) => (same(prev, NOTHING) ? prev : NOTHING));
      return;
    }
    let raf = 0;
    const measure = () => {
      const chartRect = handle.container.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      const offset = chartRect.top - frameRect.top;
      const size = handle.chart.paneSize();
      const at = (price: number | null) => {
        if (price === null) return null;
        const coordinate = handle.series.priceToCoordinate(price);
        return coordinate === null ? null : coordinate + offset;
      };
      const next: PinnedLevels = {
        ys: { target: at(target), entry: at(entry), stop: at(stop) },
        pane: {
          left: chartRect.left - frameRect.left,
          width: size.width,
          top: offset,
          bottom: offset + size.height,
        },
      };
      setPinned((prev) => (same(prev, next) ? prev : next));
      raf = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [handle, frame, target, entry, stop]);

  return pinned;
}
