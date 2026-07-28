import type { CandlestickData, MouseEventParams } from 'lightweight-charts';
import type { Candle } from '../kline';
import { detect123, detectCandlePatterns, detectDivergence } from './annotations';
import { snapshot, toCandles, volumesOf } from './snapshot';
import { mountDrawings, type DrawingsApi } from './drawings';
import { ema, macd, type PriceLevel } from './indicators';
import { buildMarks, markCount, type Detected } from './marks';
import { EMA_COLORS, EMA_PERIODS, theme } from './theme';
import {
  TRAINER_DIVIDER,
  TRAINER_START_CURSOR,
  trainerCandles,
  trainerVolumes,
  trainerPlan,
  type TrainerPlan,
} from './trainerPlan';

export interface ReplicaChart {
  setTimeframe: (timeframe: string) => void;
  advance: () => number;
  cursor: () => number;
  drawings: DrawingsApi;
  destroy: () => void;
}

export type ReplicaVariant = 'chart' | 'trainer';

export interface ReplicaChartOptions {
  variant?: ReplicaVariant;
}

interface Series extends Detected {
  candles: Candle[];
  emas: Array<Array<number | null>>;
  macd: ReturnType<typeof macd>;
  levels: PriceLevel[];
  volumes: number[];
}

const analyse = (candles: Candle[], volumes: number[], variant: ReplicaVariant): Series => {
  const closes = candles.map((candle) => candle.close);
  const macdResult = macd(closes);
  const trainer = variant === 'trainer';
  return {
    candles,
    emas: EMA_PERIODS.map((period) => ema(closes, period)),
    macd: macdResult,
    // A blind case hands over price action and nothing else; prior-session levels would
    // hand back exactly the context the exercise removes.
    levels: trainer ? [] : snapshot.chart.levels,
    volumes,
    structure: detect123(candles),
    patterns: detectCandlePatterns(candles, trainer ? 2 : 3),
    divergence: detectDivergence(candles, macdResult.dif),
  };
};

const buildSeries = (timeframe: string): Series => {
  const bars = snapshot.chart.timeframes[timeframe] ?? snapshot.chart.timeframes['15m'];
  return analyse(toCandles(bars), volumesOf(bars), 'chart');
};

const LEVEL_STYLE: Record<PriceLevel['tone'], { color: string; lineStyle: number }> = {
  pre: { color: 'rgba(190, 190, 190, 0.5)', lineStyle: 2 },
  prev: { color: 'rgba(190, 190, 190, 0.5)', lineStyle: 2 },
  anchor: { color: theme.accent, lineStyle: 2 },
};

export const mountReplicaChart = async (
  root: HTMLElement,
  options?: ReplicaChartOptions,
): Promise<ReplicaChart | null> => {
  const variant = options?.variant ?? 'chart';
  const mainEl = root.querySelector<HTMLElement>('[data-lw-main]');
  const macdEl = root.querySelector<HTMLElement>('[data-lw-macd]');
  if (!mainEl || !macdEl) return null;

  const [lc, lw] = await Promise.all([import('lightweight-charts'), import('./lw')]);

  const legend = root.querySelector<HTMLElement>(
    variant === 'trainer' ? '[data-trainer-legend]' : '[data-replica-legend]',
  );
  const marksLabel = root.querySelector<HTMLElement>('[data-replica-marks]');
  const dividerEl = root.querySelector<HTMLElement>('[data-lw-divider]');
  const aheadEl = root.querySelector<HTMLElement>('[data-lw-ahead]');

  const main = lw.baseChart(mainEl);
  const macdChart = lw.baseChart(macdEl);

  const candleSeries = main.addSeries(lc.CandlestickSeries, {
    upColor: theme.up,
    downColor: theme.down,
    borderVisible: false,
    wickUpColor: theme.up,
    wickDownColor: theme.down,
  });
  const candleMarkers = lc.createSeriesMarkers(candleSeries, []);
  const volumeSeries = main.addSeries(lc.HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: 'vol',
    priceLineVisible: false,
    lastValueVisible: false,
  });
  main.priceScale('vol').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
  main.priceScale('right').applyOptions({ scaleMargins: { top: 0.08, bottom: 0.26 } });

  const emaSeries = EMA_PERIODS.map((_, i) =>
    main.addSeries(lc.LineSeries, {
      color: EMA_COLORS[i],
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    }),
  );

  const histSeries = macdChart.addSeries(lc.HistogramSeries, {
    priceLineVisible: false,
    lastValueVisible: false,
  });
  const difSeries = macdChart.addSeries(lc.LineSeries, {
    color: theme.accent,
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: true,
  });
  const deaSeries = macdChart.addSeries(lc.LineSeries, {
    color: '#c9c9c9',
    lineWidth: 1,
    priceLineVisible: false,
    lastValueVisible: true,
  });

  const stopTimeScales = lw.syncTimeScales([main, macdChart]);
  const stopCrosshair = lw.syncCrosshair([
    { chart: main, series: candleSeries },
    { chart: macdChart, series: difSeries },
  ]);

  let priceLines: ReturnType<typeof candleSeries.createPriceLine>[] = [];
  let connectorSeries: Array<{ chart: typeof main; series: ReturnType<typeof main.addSeries> }> =
    [];

  const clearOverlays = (): void => {
    for (const line of priceLines) candleSeries.removePriceLine(line);
    priceLines = [];
    for (const entry of connectorSeries) entry.chart.removeSeries(entry.series);
    connectorSeries = [];
  };

  const plan: TrainerPlan | null = variant === 'trainer' ? trainerPlan() : null;

  const apply = (series: Series): void => {
    const times = series.candles.map((candle) => candle.time);
    candleSeries.setData(lw.toCandleData(series.candles));
    volumeSeries.setData(
      series.candles.map((candle, i) => ({
        time: lw.asTime(candle.time),
        value: series.volumes[i],
        color: candle.up ? 'rgba(38,166,154,0.42)' : 'rgba(239,83,80,0.42)',
      })),
    );
    emaSeries.forEach((line, i) => line.setData(lw.toLineData(times, series.emas[i])));
    histSeries.setData(
      series.candles.map((candle, i) => ({
        time: lw.asTime(candle.time),
        value: series.macd.hist[i] ?? 0,
        color: (series.macd.hist[i] ?? 0) >= 0 ? 'rgba(38,166,154,0.75)' : 'rgba(239,83,80,0.75)',
      })),
    );
    difSeries.setData(lw.toLineData(times, series.macd.dif));
    deaSeries.setData(lw.toLineData(times, series.macd.dea));

    clearOverlays();

    const marks = buildMarks(series.candles, series);
    candleMarkers.setMarkers(
      marks.markers.map((marker) => ({
        time: lw.asTime(marker.time),
        position: marker.position,
        color: marker.color,
        shape: marker.shape,
        text: marker.text,
      })),
    );
    for (const connector of marks.connectors) {
      const chart = connector.pane === 'macd' ? macdChart : main;
      const line = chart.addSeries(lc.LineSeries, {
        color: connector.color,
        ...lw.CONNECTOR_OPTIONS,
      });
      line.setData(
        connector.data.map((point) => ({ time: lw.asTime(point.time), value: point.value })),
      );
      connectorSeries.push({ chart, series: line });
    }

    for (const level of series.levels) {
      const style = LEVEL_STYLE[level.tone];
      priceLines.push(
        candleSeries.createPriceLine({
          price: level.value,
          color: style.color,
          lineWidth: 1,
          lineStyle: style.lineStyle as never,
          axisLabelVisible: true,
          title: level.label,
        }),
      );
    }

    if (plan) {
      const orders = [
        { price: plan.target, color: theme.up, title: 'TP' },
        { price: plan.entry, color: theme.entry, title: '入场' },
        { price: plan.stop, color: theme.down, title: 'SL' },
      ];
      for (const order of orders) {
        priceLines.push(
          candleSeries.createPriceLine({
            price: order.price,
            color: order.color,
            lineWidth: order.title === '入场' ? 2 : 1,
            lineStyle: (order.title === '入场' ? 0 : 2) as never,
            axisLabelVisible: true,
            title: order.title,
          }),
        );
      }
    }

    if (marksLabel) marksLabel.textContent = `自动标注 ${markCount(series)}`;
  };

  const placeDivider = (series: Series): void => {
    if (!dividerEl || !aheadEl) return;
    const anchor = series.candles[TRAINER_DIVIDER];
    if (!anchor) return;
    const x = main.timeScale().timeToCoordinate(lw.asTime(anchor.time));
    if (x === null) {
      dividerEl.hidden = true;
      aheadEl.hidden = true;
      return;
    }
    dividerEl.hidden = false;
    aheadEl.hidden = false;
    dividerEl.style.left = `${x}px`;
    aheadEl.style.left = `${x}px`;
  };

  const fullCandles = variant === 'trainer' ? trainerCandles() : [];
  const fullVolumes = variant === 'trainer' ? trainerVolumes() : [];
  let cursor = TRAINER_START_CURSOR;
  let series =
    variant === 'trainer'
      ? analyse(fullCandles.slice(0, cursor), fullVolumes.slice(0, cursor), variant)
      : buildSeries('15m');

  const fit = (): void => {
    main.timeScale().fitContent();
    placeDivider(series);
  };

  const drawings = mountDrawings({
    chart: main,
    series: candleSeries,
    container: mainEl,
    barTimes: series.candles.map((candle) => candle.time),
  });

  apply(series);
  fit();

  const onRange = (): void => placeDivider(series);
  main.timeScale().subscribeVisibleLogicalRangeChange(onRange);

  const onCrosshair = (param: MouseEventParams): void => {
    if (!legend) return;
    const bar =
      param.time === undefined
        ? null
        : (param.seriesData.get(candleSeries) as CandlestickData | undefined);
    if (bar && bar.close !== undefined) {
      legend.textContent = `O ${bar.open.toFixed(2)}  H ${bar.high.toFixed(2)}  L ${bar.low.toFixed(2)}  C ${bar.close.toFixed(2)}`;
      legend.dataset.tone = bar.close >= bar.open ? 'up' : 'down';
      return;
    }
    const last = series.emas.map((line) => {
      for (let i = line.length - 1; i >= 0; i--) if (line[i] !== null) return line[i] as number;
      return 0;
    });
    legend.textContent = EMA_PERIODS.map((period, i) => `EMA${period} ${last[i].toFixed(2)}`).join(
      '   ',
    );
    legend.dataset.tone = 'idle';
  };
  main.subscribeCrosshairMove(onCrosshair);
  onCrosshair({ seriesData: new Map() } as MouseEventParams);

  const onResize = (): void => fit();
  window.addEventListener('resize', onResize);

  return {
    setTimeframe: (timeframe: string) => {
      if (variant === 'trainer') return;
      series = buildSeries(timeframe);
      apply(series);
      drawings.setBarTimes(series.candles.map((candle) => candle.time));
      fit();
    },
    advance: () => {
      if (variant !== 'trainer' || cursor >= fullCandles.length) return cursor;
      cursor += 1;
      series = analyse(fullCandles.slice(0, cursor), fullVolumes.slice(0, cursor), variant);
      apply(series);
      drawings.setBarTimes(series.candles.map((candle) => candle.time));
      fit();
      return cursor;
    },
    cursor: () => cursor,
    drawings,
    destroy: () => {
      drawings.destroy();
      window.removeEventListener('resize', onResize);
      main.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      main.unsubscribeCrosshairMove(onCrosshair);
      stopTimeScales();
      stopCrosshair();
      main.remove();
      macdChart.remove();
    },
  };
};
