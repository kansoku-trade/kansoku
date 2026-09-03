import { useMemo } from 'react';
import type { IntradayBuilt, IntradayTfData } from '@kansoku/shared/types';
import { useLiveQuote } from '@web/features/quotes/useLiveQuote';
import { isViewPeriod, tfDataOf, withViewTimeframe, type ChartTf } from './timeframes';

export function applyLiveQuote(
  tf: IntradayTfData,
  last: number | null | undefined,
): IntradayTfData {
  const bar = tf.candles.at(-1);
  if (!bar || last == null || !Number.isFinite(last) || last <= 0) return tf;
  if (bar.close === last) return tf;
  const patched = {
    ...bar,
    close: last,
    high: Math.max(bar.high, last),
    low: Math.min(bar.low, last),
  };
  return { ...tf, candles: [...tf.candles.slice(0, -1), patched] };
}

export function useLiveBuilt(
  built: IntradayBuilt,
  activeTf: ChartTf,
  symbol: string,
  live: boolean,
): IntradayBuilt {
  const last = useLiveQuote(live ? symbol : null)?.last;
  return useMemo(() => {
    if (!isViewPeriod(activeTf)) return built;
    const tf = tfDataOf(built, activeTf);
    if (!tf) return built;
    const patched = applyLiveQuote(tf, last);
    return patched === tf ? built : withViewTimeframe(built, activeTf, patched);
  }, [built, activeTf, last]);
}
