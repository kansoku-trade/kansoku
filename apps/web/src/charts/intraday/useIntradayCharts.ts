import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LogicalRange,
  type Time,
} from "lightweight-charts";
import type { IntradayBuilt, IntradayPriceZone, SeriesMarker, TimeframeKey } from "@kansoku/shared/types";
import {
  addPriceLine,
  attachMarkers,
  baseChart,
  centerLastBar,
  markerTooltip,
  observeSize,
  padHistData,
  padLineData,
  syncTimeScales,
  toCandleData,
  toLineData,
  toMarkers,
  toVolumeData,
  type MarkerTooltipHandle,
} from "../lw";
import type { IndicatorToggleKey } from "./useIndicatorToggles";
import { AnchorBgPrimitive } from "./anchorPrimitive";
import { FvgPrimitive } from "./fvgPrimitive";
import { SessionBgPrimitive } from "./sessionPrimitive";
import { seriesPalette, theme } from "@web/theme";

export const EMA_COLORS = [theme.accent, theme.textPrimary, theme.textSecondary, theme.up, theme.down] as const;

const ENTRY_STATUS_SUFFIX: Record<string, string> = {
  waiting: "（待触发）",
  triggered: "（已触发）",
  invalidated: "（已失效）",
  stopped: "（已打止损）",
};

interface Handle {
  main: IChartApi;
  macd: IChartApi;
  candle: ISeriesApi<"Candlestick">;
  candleMarkers: ISeriesMarkersPluginApi<Time>;
  vol: ISeriesApi<"Histogram">;
  session: SessionBgPrimitive;
  macdSession: SessionBgPrimitive;
  emaSeries: ISeriesApi<"Line">[];
  vwapSeries: ISeriesApi<"Line">;
  hist: ISeriesApi<"Histogram">;
  dif: ISeriesApi<"Line">;
  difMarkers: ISeriesMarkersPluginApi<Time>;
  dea: ISeriesApi<"Line">;
  mainTip: MarkerTooltipHandle;
  macdTip: MarkerTooltipHandle;
  dynamic: { chart: IChartApi; series: ISeriesApi<"Line"> }[];
  planLines: ReturnType<typeof addPriceLine>[];
  fvg: FvgPrimitive;
  anchorBg: AnchorBgPrimitive;
}

const NEAR_LEFT_BARS = 10;
const VWAP_COLOR = "#c084fc";
const DAY_LEVEL_COLOR = "#8b949e";
const CALL_WALL_COLOR = "#e3b341";
const PUT_WALL_COLOR = "#39c5cf";

const fmtOi = (oi: number) => (oi >= 1000 ? `${(oi / 1000).toFixed(1)}k` : String(oi));

const zoneTitle = (z: IntradayPriceZone, edge?: "上沿" | "下沿") =>
  `${z.label}${edge ? edge : ""} $${(edge === "上沿" ? z.high : z.low).toFixed(2)}`;

const groupAllowed = (toggles: Record<IndicatorToggleKey, boolean>, group?: SeriesMarker["group"]) =>
  group === undefined || toggles[group as IndicatorToggleKey];

const filterByGroup = <T extends { group?: SeriesMarker["group"] }>(
  items: T[],
  toggles: Record<IndicatorToggleKey, boolean>,
): T[] => items.filter((item) => groupAllowed(toggles, item.group));

export interface DrawingChartHandle {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
  container: HTMLElement;
}

export function useIntradayCharts(
  built: IntradayBuilt,
  activeTf: TimeframeKey,
  mainRef: RefObject<HTMLDivElement | null>,
  macdRef: RefObject<HTMLDivElement | null>,
  onNearLeftEdge: (() => void) | undefined,
  toggles: Record<IndicatorToggleKey, boolean>,
  onHandle?: (h: DrawingChartHandle | null) => void,
): void {
  const handleRef = useRef<Handle | null>(null);
  const builtRef = useRef(built);
  builtRef.current = built;
  const lastTfRef = useRef<TimeframeKey | null>(null);
  const lastBuiltRef = useRef<IntradayBuilt | null>(null);
  const barCountRef = useRef(0);
  const firstTimeRef = useRef<number | null>(null);
  const onNearRef = useRef(onNearLeftEdge);
  onNearRef.current = onNearLeftEdge;
  const onHandleRef = useRef(onHandle);
  onHandleRef.current = onHandle;

  useEffect(() => {
    const mainEl = mainRef.current;
    const macdEl = macdRef.current;
    if (!mainEl || !macdEl) return;

    const main = baseChart(mainEl, true, true);
    const candle = main.addSeries(CandlestickSeries, {
      upColor: theme.up,
      downColor: theme.down,
      borderVisible: false,
      wickUpColor: theme.up,
      wickDownColor: theme.down,
    });
    const candleMarkers = attachMarkers(candle);
    const vol = main.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    main.priceScale("vol").applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });
    main.priceScale("right").applyOptions({ scaleMargins: { top: 0.08, bottom: 0.3 } });

    const session = new SessionBgPrimitive();
    candle.attachPrimitive(session);
    const fvg = new FvgPrimitive();
    candle.attachPrimitive(fvg);
    const anchorBg = new AnchorBgPrimitive();
    candle.attachPrimitive(anchorBg);

    const emaCount = builtRef.current.timeframes.m5?.emas?.length ?? 0;
    const emaSeries = Array.from({ length: emaCount }, (_, i) =>
      main.addSeries(LineSeries, {
        color: EMA_COLORS[i % EMA_COLORS.length],
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      }),
    );

    const vwapSeries = main.addSeries(LineSeries, {
      color: VWAP_COLOR,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    });

    const macd = baseChart(macdEl, true, true);
    const hist = macd.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
    const macdSession = new SessionBgPrimitive();
    hist.attachPrimitive(macdSession);
    const dif = macd.addSeries(LineSeries, { color: theme.accent, lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
    const difMarkers = attachMarkers(dif);
    const dea = macd.addSeries(LineSeries, { color: seriesPalette[4], lineWidth: 1, priceLineVisible: false, lastValueVisible: true });

    const stopTimeScaleSync = syncTimeScales([main, macd]);
    const observers = [observeSize(mainEl, main), observeSize(macdEl, macd)];
    const mainTip = markerTooltip(main, mainEl);
    const macdTip = markerTooltip(macd, macdEl);

    const onRangeChange = (range: LogicalRange | null) => {
      if (range && range.from < NEAR_LEFT_BARS) onNearRef.current?.();
    };
    main.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);

    handleRef.current = {
      main,
      macd,
      candle,
      candleMarkers,
      vol,
      session,
      macdSession,
      emaSeries,
      vwapSeries,
      hist,
      dif,
      difMarkers,
      dea,
      mainTip,
      macdTip,
      dynamic: [],
      planLines: [],
      fvg,
      anchorBg,
    };
    lastTfRef.current = null;
    firstTimeRef.current = null;
    onHandleRef.current?.({ chart: main, series: candle, container: mainEl });

    return () => {
      onHandleRef.current?.(null);
      main.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange);
      mainTip.destroy();
      macdTip.destroy();
      observers.forEach((ro) => ro.disconnect());
      stopTimeScaleSync();
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
    h.session.setData(d.offSession ?? []);
    h.macdSession.setData(d.offSession ?? []);
    h.emaSeries.forEach((s, i) => {
      const emaLine = d.emas[i];
      s.setData(toggles.ema && emaLine ? padLineData(emaLine.data, timeline) : []);
    });
    h.vwapSeries.setData(toggles.vwap && d.vwap ? padLineData(d.vwap, timeline) : []);
    h.fvg.setData(toggles.fvg ? (d.fvgZones ?? []) : []);
    const anchor = built.sidebar.prediction?.anchor;
    const anchorHere = anchor && anchor.timeframe === activeTf ? anchor : null;
    h.anchorBg.setData(toggles.ai && anchorHere ? [Math.floor(Date.parse(anchorHere.time) / 1000)] : []);
    const markers = filterByGroup(d.markers, toggles);
    h.candleMarkers.setMarkers(toMarkers(markers));
    h.mainTip.setMarkers(markers);
    h.dif.setData(padLineData(d.macdDif, timeline));
    h.dea.setData(padLineData(d.macdDea, timeline));
    h.hist.setData(padHistData(d.macdHist, timeline));
    const crossMarkers = toggles.crosses ? d.macdCrossMarkers : [];
    h.difMarkers.setMarkers(toMarkers(crossMarkers));
    h.macdTip.setMarkers(crossMarkers);

    const connectorOpts = {
      lineWidth: 1 as const,
      lineStyle: 2 as const,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    };
    filterByGroup(d.priceConnectors ?? [], toggles).forEach((c) => {
      const s = h.main.addSeries(LineSeries, { color: c.color, ...connectorOpts });
      s.setData(toLineData(c.data));
      h.dynamic.push({ chart: h.main, series: s });
    });
    filterByGroup(d.macdConnectors ?? [], toggles).forEach((c) => {
      const s = h.macd.addSeries(LineSeries, { color: c.color, ...connectorOpts });
      s.setData(toLineData(c.data));
      h.dynamic.push({ chart: h.macd, series: s });
    });

    h.planLines.forEach((line) => h.candle.removePriceLine(line));
    h.planLines = [];
    if (toggles.levels && anchorHere) {
      h.planLines.push(addPriceLine(h.candle, { price: anchorHere.price, color: theme.accent, lineWidth: 1, lineStyle: 2, title: `🎯 锚 $${anchorHere.price.toFixed(2)}` }));
    }
    const ep = built.entryPlan;
    if (ep && toggles.levels) {
      const planDead = ep.entry_status === "invalidated" || ep.entry_status === "stopped";
      const deadColor = "#6e7681";
      const suffix = ep.entry_status ? (ENTRY_STATUS_SUFFIX[ep.entry_status] ?? "") : "";
      h.planLines.push(addPriceLine(h.candle, { price: ep.entry, color: planDead ? deadColor : theme.accent, lineWidth: 2, lineStyle: planDead ? 2 : 0, title: `入场 $${ep.entry.toFixed(2)}${suffix}` }));
      h.planLines.push(addPriceLine(h.candle, { price: ep.stop, color: planDead ? deadColor : theme.down, lineWidth: 2, lineStyle: 2, title: `止损 $${ep.stop.toFixed(2)}` }));
      h.planLines.push(addPriceLine(h.candle, { price: ep.target1, color: planDead ? deadColor : theme.up, lineWidth: 1, lineStyle: 2, title: `T1 $${ep.target1.toFixed(2)}` }));
      h.planLines.push(addPriceLine(h.candle, { price: ep.target2, color: planDead ? deadColor : seriesPalette[1], lineWidth: 1, lineStyle: 2, title: `T2 $${ep.target2.toFixed(2)}` }));
      (ep.price_zones ?? [])
        .filter((z) => z.kind === "resistance")
        .forEach((z) => {
          const color = z.color ?? theme.textSecondary;
          if (Math.abs(z.high - z.low) < 0.0001) {
            h.planLines.push(addPriceLine(h.candle, { price: z.low, color, lineWidth: 1, lineStyle: 2, title: zoneTitle(z) }));
          } else {
            h.planLines.push(addPriceLine(h.candle, { price: z.low, color, lineWidth: 1, lineStyle: 2, title: zoneTitle(z, "下沿") }));
            h.planLines.push(addPriceLine(h.candle, { price: z.high, color, lineWidth: 1, lineStyle: 2, title: zoneTitle(z, "上沿") }));
          }
        });
    }

    const dc = built.sidebar.dayContext;
    if (toggles.daylevel && dc) {
      const dayLevels: { price: number | null | undefined; title: string }[] = [
        { price: dc.prev_day?.high, title: "昨高" },
        { price: dc.prev_day?.close, title: "昨收" },
        { price: dc.prev_day?.low, title: "昨低" },
        { price: dc.pre_market?.high, title: "盘前高" },
        { price: dc.pre_market?.low, title: "盘前低" },
        { price: dc.opening_range?.high, title: "开盘区高" },
        { price: dc.opening_range?.low, title: "开盘区低" },
      ];
      for (const { price, title } of dayLevels) {
        if (price == null) continue;
        h.planLines.push(
          addPriceLine(h.candle, { price, color: DAY_LEVEL_COLOR, lineWidth: 1, lineStyle: 1, title: `${title} $${price.toFixed(2)}` }),
        );
      }
    }

    const ow = built.sidebar.optionsLevels;
    if (toggles.optwall && ow) {
      for (const w of ow.walls) {
        const call = w.dominant === "call";
        h.planLines.push(
          addPriceLine(h.candle, {
            price: w.strike,
            color: call ? CALL_WALL_COLOR : PUT_WALL_COLOR,
            lineWidth: 1,
            lineStyle: 4,
            title: `${call ? "C墙" : "P墙"} $${w.strike} (${fmtOi(call ? w.call_oi : w.put_oi)})`,
          }),
        );
      }
    }

    if (lastTfRef.current !== activeTf) {
      lastTfRef.current = activeTf;
      centerLastBar(h.main, d.candles);
    } else if (lastBuiltRef.current !== built) {
      const prepended = firstTimeRef.current === null ? 0 : timeline.indexOf(firstTimeRef.current);
      const appended = d.candles.length - barCountRef.current - Math.max(prepended, 0);
      if (prepended > 0 && prevRange) {
        h.main.timeScale().setVisibleLogicalRange({ from: prevRange.from + prepended, to: prevRange.to + prepended });
      } else if (wasAtRight && appended > 0) {
        // Shift instead of scrollToRealTime(): live pushes arrive every ~2s and the
        // scroll animation would keep the chart in constant motion.
        if (prevRange) {
          h.main.timeScale().setVisibleLogicalRange({ from: prevRange.from + appended, to: prevRange.to + appended });
        } else {
          h.main.timeScale().scrollToRealTime();
        }
      }
    }
    lastBuiltRef.current = built;
    barCountRef.current = d.candles.length;
    firstTimeRef.current = timeline[0] ?? null;
  }, [built, activeTf, toggles]);
}
