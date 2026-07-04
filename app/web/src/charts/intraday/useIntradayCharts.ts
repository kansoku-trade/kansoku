import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi, LogicalRange } from "lightweight-charts";
import type { IntradayBuilt, IntradayPriceZone, SeriesMarker, TimeframeKey } from "../../../../shared/types";
import {
  addPriceLine,
  asTime,
  baseChart,
  markerTooltip,
  observeSize,
  padHistData,
  padLineData,
  showLastBars,
  syncTimeScales,
  toCandleData,
  toLineData,
  toVolumeData,
  toMarkers,
  type MarkerTooltipHandle,
} from "../lw";
import type { IndicatorToggleKey } from "./useIndicatorToggles";

export const EMA_COLORS = ["#ffb74d", "#ba68c8", "#4fc3f7", "#ffee58"];

interface Handle {
  main: IChartApi;
  macd: IChartApi;
  candle: ISeriesApi<"Candlestick">;
  vol: ISeriesApi<"Histogram">;
  session: ISeriesApi<"Histogram">;
  macdSession: ISeriesApi<"Histogram">;
  emaSeries: ISeriesApi<"Line">[];
  hist: ISeriesApi<"Histogram">;
  dif: ISeriesApi<"Line">;
  dea: ISeriesApi<"Line">;
  mainTip: MarkerTooltipHandle;
  macdTip: MarkerTooltipHandle;
  dynamic: { chart: IChartApi; series: ISeriesApi<"Line"> }[];
  planLines: ReturnType<typeof addPriceLine>[];
}

const sessionBackdrop = (chart: IChartApi, scaleId: string): ISeriesApi<"Histogram"> => {
  const series = chart.addHistogramSeries({
    priceScaleId: scaleId,
    priceLineVisible: false,
    lastValueVisible: false,
  });
  chart.priceScale(scaleId).applyOptions({ scaleMargins: { top: 0, bottom: 0 } });
  return series;
};

const NEAR_LEFT_BARS = 10;

const zoneTitle = (z: IntradayPriceZone, edge?: "上沿" | "下沿") =>
  `${z.label}${edge ? edge : ""} $${(edge === "上沿" ? z.high : z.low).toFixed(2)}`;

const groupAllowed = (toggles: Record<IndicatorToggleKey, boolean>, group?: SeriesMarker["group"]) =>
  group === undefined || toggles[group as IndicatorToggleKey];

const filterByGroup = <T extends { group?: SeriesMarker["group"] }>(
  items: T[],
  toggles: Record<IndicatorToggleKey, boolean>,
): T[] => items.filter((item) => groupAllowed(toggles, item.group));

export function useIntradayCharts(
  built: IntradayBuilt,
  activeTf: TimeframeKey,
  mainRef: RefObject<HTMLDivElement | null>,
  macdRef: RefObject<HTMLDivElement | null>,
  onNearLeftEdge: (() => void) | undefined,
  toggles: Record<IndicatorToggleKey, boolean>,
): void {
  const handleRef = useRef<Handle | null>(null);
  const builtRef = useRef(built);
  builtRef.current = built;
  const lastTfRef = useRef<TimeframeKey | null>(null);
  const barCountRef = useRef(0);
  const firstTimeRef = useRef<number | null>(null);
  const onNearRef = useRef(onNearLeftEdge);
  onNearRef.current = onNearLeftEdge;

  useEffect(() => {
    const mainEl = mainRef.current;
    const macdEl = macdRef.current;
    if (!mainEl || !macdEl) return;

    const main = baseChart(mainEl, true, true);
    const session = sessionBackdrop(main, "session");
    const candle = main.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    const vol = main.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    main.priceScale("vol").applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });
    main.priceScale("right").applyOptions({ scaleMargins: { top: 0.08, bottom: 0.3 } });

    const emaCount = builtRef.current.timeframes.m5?.emas?.length ?? 0;
    const emaSeries = Array.from({ length: emaCount }, (_, i) =>
      main.addLineSeries({
        color: EMA_COLORS[i % EMA_COLORS.length],
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      }),
    );

    const macd = baseChart(macdEl, true, true);
    const macdSession = sessionBackdrop(macd, "msession");
    const hist = macd.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
    const dif = macd.addLineSeries({ color: "#42a5f5", lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
    const dea = macd.addLineSeries({ color: "#ff9800", lineWidth: 1, priceLineVisible: false, lastValueVisible: true });

    syncTimeScales([main, macd]);
    const observers = [observeSize(mainEl, main), observeSize(macdEl, macd)];
    const mainTip = markerTooltip(main, mainEl);
    const macdTip = markerTooltip(macd, macdEl);

    const onRangeChange = (range: LogicalRange | null) => {
      if (range && range.from < NEAR_LEFT_BARS) onNearRef.current?.();
    };
    main.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);

    handleRef.current = { main, macd, candle, vol, session, macdSession, emaSeries, hist, dif, dea, mainTip, macdTip, dynamic: [], planLines: [] };
    lastTfRef.current = null;
    firstTimeRef.current = null;

    return () => {
      main.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange);
      mainTip.destroy();
      macdTip.destroy();
      observers.forEach((ro) => ro.disconnect());
      main.remove();
      macd.remove();
      handleRef.current = null;
    };
  }, [mainRef, macdRef]);

  useEffect(() => {
    const h = handleRef.current;
    const d = built.timeframes[activeTf];
    if (!h || !d) return;

    h.dynamic.forEach(({ chart, series }) => {
      try {
        chart.removeSeries(series);
      } catch {
        return;
      }
    });
    h.dynamic = [];

    const timeline = d.candles.map((c) => c.time);
    const prevRange = h.main.timeScale().getVisibleLogicalRange();
    const wasAtRight = prevRange === null || prevRange.to >= barCountRef.current - 2;

    h.candle.setData(toCandleData(d.candles));
    h.vol.setData(toVolumeData(d.volumes));
    const sessData = (d.offSession ?? []).map((s) => ({
      time: asTime(s.time),
      value: 1,
      color: s.kind === "overnight" ? "rgba(88,166,255,0.16)" : "rgba(88,166,255,0.09)",
    }));
    h.session.setData(sessData);
    h.macdSession.setData(sessData);
    h.emaSeries.forEach((s, i) => {
      const emaLine = d.emas[i];
      s.setData(toggles.ema && emaLine ? padLineData(emaLine.data, timeline) : []);
    });
    const markers = filterByGroup(d.markers, toggles);
    h.candle.setMarkers(toMarkers(markers));
    h.mainTip.setMarkers(markers);
    h.dif.setData(padLineData(d.macdDif, timeline));
    h.dea.setData(padLineData(d.macdDea, timeline));
    h.hist.setData(padHistData(d.macdHist, timeline));
    const crossMarkers = toggles.crosses ? d.macdCrossMarkers : [];
    h.dif.setMarkers(toMarkers(crossMarkers));
    h.macdTip.setMarkers(crossMarkers);

    const connectorOpts = {
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    } as const;
    filterByGroup(d.priceConnectors ?? [], toggles).forEach((c) => {
      const s = h.main.addLineSeries({ color: c.color, ...connectorOpts });
      s.setData(toLineData(c.data));
      h.dynamic.push({ chart: h.main, series: s });
    });
    filterByGroup(d.macdConnectors ?? [], toggles).forEach((c) => {
      const s = h.macd.addLineSeries({ color: c.color, ...connectorOpts });
      s.setData(toLineData(c.data));
      h.dynamic.push({ chart: h.macd, series: s });
    });

    h.planLines.forEach((line) => h.candle.removePriceLine(line));
    h.planLines = [];
    const ep = built.entryPlan;
    if (ep && toggles.levels) {
      h.planLines.push(addPriceLine(h.candle, { price: ep.entry, color: "#58a6ff", lineWidth: 2, lineStyle: 0, title: `入场 $${ep.entry.toFixed(2)}` }));
      h.planLines.push(addPriceLine(h.candle, { price: ep.stop, color: "#ef5350", lineWidth: 2, lineStyle: 2, title: `止损 $${ep.stop.toFixed(2)}` }));
      h.planLines.push(addPriceLine(h.candle, { price: ep.target1, color: "#26a69a", lineWidth: 1, lineStyle: 2, title: `T1 $${ep.target1.toFixed(2)}` }));
      h.planLines.push(addPriceLine(h.candle, { price: ep.target2, color: "#00897b", lineWidth: 1, lineStyle: 2, title: `T2 $${ep.target2.toFixed(2)}` }));
      (ep.price_zones ?? [])
        .filter((z) => z.kind === "resistance")
        .forEach((z) => {
          const color = z.color ?? "#8b949e";
          if (Math.abs(z.high - z.low) < 0.0001) {
            h.planLines.push(addPriceLine(h.candle, { price: z.low, color, lineWidth: 1, lineStyle: 2, title: zoneTitle(z) }));
          } else {
            h.planLines.push(addPriceLine(h.candle, { price: z.low, color, lineWidth: 1, lineStyle: 2, title: zoneTitle(z, "下沿") }));
            h.planLines.push(addPriceLine(h.candle, { price: z.high, color, lineWidth: 1, lineStyle: 2, title: zoneTitle(z, "上沿") }));
          }
        });
    }

    if (lastTfRef.current !== activeTf) {
      lastTfRef.current = activeTf;
      showLastBars(h.main, d.candles);
    } else {
      const prepended = firstTimeRef.current === null ? 0 : timeline.indexOf(firstTimeRef.current);
      if (prepended > 0 && prevRange) {
        h.main.timeScale().setVisibleLogicalRange({ from: prevRange.from + prepended, to: prevRange.to + prepended });
      } else if (wasAtRight) {
        h.main.timeScale().scrollToRealTime();
      }
    }
    barCountRef.current = d.candles.length;
    firstTimeRef.current = timeline[0] ?? null;
  }, [built, activeTf, toggles]);
}
