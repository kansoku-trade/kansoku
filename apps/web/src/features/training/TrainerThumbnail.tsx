import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
} from 'lightweight-charts';
import type { IntradayBuilt } from '@kansoku/shared/types';
import { theme } from '@web/lib/theme';
import { attachMarkers, observeSize, toCandleData, toMarkers } from '../charts/lw';
import { tfDataOf, type ChartTf } from '../charts/intraday/timeframes';
import type { DrawingChartHandle } from '../charts/intraday/useIntradayCharts';

// The full chart reserves the bottom 30% of its price scale for the volume histogram, and those
// margins are fractions of pane height — at 108px that leaves ~55px of usable band, too little for
// lightweight-charts to hold a narrow price range, so it widens the range to a tick-friendly span
// and the candles flatten into a line. The strip carries no volume, so it spends its whole height
// on price.
const PRICE_MARGINS = { top: 0.06, bottom: 0.06 };

interface ThumbnailChart {
  chart: IChartApi;
  candle: ISeriesApi<'Candlestick'>;
  markers: ISeriesMarkersPluginApi<Time>;
}

export interface TrainerThumbnailProps {
  built: IntradayBuilt;
  activeTf: ChartTf;
  onChartHandle: (handle: DrawingChartHandle | null) => void;
}

export function TrainerThumbnail({ built, activeTf, onChartHandle }: TrainerThumbnailProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ThumbnailChart | null>(null);
  const onHandleRef = useRef(onChartHandle);
  onHandleRef.current = onChartHandle;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const chart = createChart(host, {
      width: host.clientWidth,
      height: host.clientHeight,
      layout: { background: { color: theme.bgSurface }, textColor: theme.textSecondary },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: { mode: 0 },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: false },
      handleScroll: false,
      handleScale: false,
    });
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: theme.up,
      downColor: theme.down,
      borderVisible: false,
      wickUpColor: theme.up,
      wickDownColor: theme.down,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    candle.priceScale().applyOptions({ scaleMargins: PRICE_MARGINS });
    const markers = attachMarkers(candle);
    const observer = observeSize(host, chart);
    chartRef.current = { chart, candle, markers };
    onHandleRef.current({ chart, series: candle, container: host });

    return () => {
      onHandleRef.current(null);
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const current = chartRef.current;
    const data = tfDataOf(built, activeTf);
    if (!current || !data) return;
    current.candle.setData(toCandleData(data.candles));
    current.markers.setMarkers(toMarkers(data.markers));
    current.chart.timeScale().fitContent();
  }, [built, activeTf]);

  return <div ref={hostRef} className="trainer-thumb-host" />;
}
