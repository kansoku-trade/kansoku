import { useLayoutEffect, useState } from 'react';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';

export interface PinnedPrices {
  target: number | null;
  entry: number | null;
  stop: number | null;
}

export type PinnedYs = { [K in keyof PinnedPrices]: number | null };

const NOTHING: PinnedYs = { target: null, entry: null, stop: null };

function sameYs(a: PinnedYs, b: PinnedYs): boolean {
  return a.target === b.target && a.entry === b.entry && a.stop === b.stop;
}

// lightweight-charts emits no event when the price scale rescales — autoscale runs during its own
// paint — so anything pinned to a price has to re-measure per frame to stay on its line while the
// chart pans, zooms or refits. One loop covers all three levels; it stops as soon as every price is
// null, which is whenever there is no order and no position.
export function usePinnedPriceYs(
  handle: DrawingChartHandle | null,
  frame: HTMLElement | null,
  prices: PinnedPrices,
): PinnedYs {
  const [ys, setYs] = useState<PinnedYs>(NOTHING);
  const { target, entry, stop } = prices;

  // Layout effect, not a plain effect: the first measurement lands in the same commit as the pills
  // it positions, so they never paint one frame at the wrong price.
  useLayoutEffect(() => {
    const live = target !== null || entry !== null || stop !== null;
    if (!handle || !frame || !live) {
      setYs((prev) => (sameYs(prev, NOTHING) ? prev : NOTHING));
      return;
    }
    let raf = 0;
    const measure = () => {
      const offset =
        handle.container.getBoundingClientRect().top - frame.getBoundingClientRect().top;
      const at = (price: number | null) => {
        if (price === null) return null;
        const coordinate = handle.series.priceToCoordinate(price);
        return coordinate === null ? null : coordinate + offset;
      };
      const next: PinnedYs = { target: at(target), entry: at(entry), stop: at(stop) };
      setYs((prev) => (sameYs(prev, next) ? prev : next));
      raf = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [handle, frame, target, entry, stop]);

  return ys;
}
