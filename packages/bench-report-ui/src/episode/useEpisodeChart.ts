import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  CandlestickSeries,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type Time,
} from 'lightweight-charts';
import { createBarHighlight, createHistoricalBackground } from './chart/primitives';
import { chartTheme } from '../styles/chartTheme';
import type { ChartScene } from './chart/scene';

function renderScene(container: HTMLElement, scene: ChartScene): IChartApi {
  container.innerHTML = '';
  const timeVisible = scene.rangeText.startsWith('1 小时');
  const chart = createChart(container, {
    autoSize: true,
    layout: {
      background: { color: chartTheme.bgSurface },
      textColor: chartTheme.textSecondary,
      fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      fontSize: 10,
      panes: {
        separatorColor: chartTheme.border,
        separatorHoverColor: chartTheme.borderStrong,
        enableResize: false,
      },
    },
    grid: { vertLines: { color: chartTheme.gridLine }, horzLines: { color: chartTheme.gridLine } },
    rightPriceScale: { borderColor: chartTheme.border, scaleMargins: { top: 0.08, bottom: 0.08 } },
    timeScale: { borderColor: chartTheme.border, timeVisible, secondsVisible: false },
    crosshair: { mode: CrosshairMode.MagnetOHLC },
    handleScale: true,
    handleScroll: true,
  });

  const candles = chart.addSeries(CandlestickSeries, {
    upColor: chartTheme.up,
    downColor: chartTheme.down,
    borderVisible: false,
    wickUpColor: chartTheme.up,
    wickDownColor: chartTheme.down,
    priceLineVisible: false,
  });
  candles.setData(scene.candles.map((bar) => ({ ...bar, time: bar.time as Time })));

  const background = createHistoricalBackground(chart, scene.splitTime);
  if (background) candles.attachPrimitive(background);

  const volume = chart.addSeries(
    HistogramSeries,
    { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false },
    1,
  );
  volume.setData(scene.volume.map((bar) => ({ ...bar, time: bar.time as Time })));

  if (scene.ema) {
    const ema = chart.addSeries(LineSeries, {
      color: chartTheme.ema,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    ema.setData(scene.ema.map((point) => ({ ...point, time: point.time as Time })));
  }

  scene.priceLines.forEach((line) =>
    candles.createPriceLine({
      price: line.price,
      color: line.color,
      lineWidth: 1,
      lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
      axisLabelVisible: true,
      title: line.title,
    }),
  );

  if (scene.silentMarkers.length) {
    createSeriesMarkers(
      candles,
      scene.silentMarkers.map((marker) => ({ ...marker, time: marker.time as Time })),
      { autoScale: true },
    );
  }

  const tip = document.createElement('div');
  tip.className = 'chart-marker-tooltip';
  container.appendChild(tip);
  chart.subscribeCrosshairMove((param) => {
    if (!param || !param.time || !param.point) {
      tip.style.display = 'none';
      return;
    }
    const texts = scene.tooltips.get(String(param.time));
    if (!texts || !texts.length) {
      tip.style.display = 'none';
      return;
    }
    tip.textContent = '';
    for (const line of texts) {
      const row = document.createElement('div');
      row.textContent = line;
      tip.appendChild(row);
    }
    tip.style.display = 'block';
    const rect = container.getBoundingClientRect();
    const px = param.point.x + 14;
    const py = param.point.y + 14;
    tip.style.left = `${Math.max(4, Math.min(px, rect.width - tip.offsetWidth - 6))}px`;
    tip.style.top = `${Math.max(4, Math.min(py, rect.height - tip.offsetHeight - 6))}px`;
  });

  const highlight = createBarHighlight(chart, scene.highlightTime);
  if (highlight) candles.attachPrimitive(highlight);

  chart.timeScale().setVisibleLogicalRange(scene.visibleRange);
  const panes = chart.panes();
  if (panes[1]) panes[1].setHeight(72);
  return chart;
}

export function useEpisodeChart(containerRef: RefObject<HTMLDivElement | null>, scene: ChartScene) {
  const chartRef = useRef<IChartApi | null>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (visible) return;
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '<span class="chart-loading">加载图表…</span>';
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '300px' },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, visible]);

  useEffect(() => {
    if (!visible) return;
    const container = containerRef.current;
    if (!container) return;
    chartRef.current?.remove();
    chartRef.current = renderScene(container, scene);
    return () => {
      chartRef.current?.remove();
      chartRef.current = null;
    };
  }, [containerRef, scene, visible]);
}