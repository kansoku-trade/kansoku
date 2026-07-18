import type { RefObject } from "react";
import { useEffect, useState } from "react";
import {
  BaselineSeries,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type ISeriesApi,
} from "lightweight-charts";
import type { SepaChartData } from "@kansoku/shared/types";
import type { LayerGroup } from "../LayerPanel";
import {
  asTime,
  attachMarkers,
  baseChart,
  makeTogglableLine,
  observeSize,
  padHistData,
  padLineData,
  showLastBars,
  syncTimeScales,
  toCandleData,
  toLineData,
  toMarkers,
  toVolumeData,
} from "../lw";
import { seriesPalette, theme } from "@web/theme";

const VP_WIDTH = 90;

export function useSepaCharts(
  chart: SepaChartData,
  mainRef: RefObject<HTMLDivElement | null>,
  rsRef: RefObject<HTMLDivElement | null>,
  vrRef: RefObject<HTMLDivElement | null>,
  vpCanvasRef: RefObject<HTMLCanvasElement | null>,
): LayerGroup[] {
  const [groups, setGroups] = useState<LayerGroup[]>([]);

  useEffect(() => {
    const mainEl = mainRef.current;
    const rsEl = rsRef.current;
    const vrEl = vrRef.current;
    const vpCanvas = vpCanvasRef.current;
    if (!mainEl || !rsEl || !vrEl || !vpCanvas) return;

    const main = baseChart(mainEl, false);
    const candle = main.addSeries(CandlestickSeries, {
      upColor: theme.up,
      downColor: theme.down,
      borderVisible: false,
      wickUpColor: theme.up,
      wickDownColor: theme.down,
    });
    candle.setData(toCandleData(chart.candles));
    const candleMarkers = attachMarkers(candle, chart.markers);

    const lineOpts = { lineWidth: 2 as const, priceLineVisible: false, lastValueVisible: false };
    const ma50 = main.addSeries(LineSeries, { color: seriesPalette[0], ...lineOpts });
    const ma150 = main.addSeries(LineSeries, { color: seriesPalette[4], ...lineOpts });
    const ma200 = main.addSeries(LineSeries, { color: seriesPalette[1], ...lineOpts });
    ma50.setData(toLineData(chart.ma50));
    ma150.setData(toLineData(chart.ma150));
    ma200.setData(toLineData(chart.ma200));

    const lineH52w = makeTogglableLine(candle, { price: chart.high52w, color: seriesPalette[4], lineWidth: 1, lineStyle: 2, title: "52w 高" });
    const lineL52w = makeTogglableLine(candle, { price: chart.low52w, color: theme.up, lineWidth: 1, lineStyle: 2, title: "52w 低" });
    const lineExt = chart.extendedLine
      ? makeTogglableLine(candle, { price: chart.extendedLine, color: theme.down, lineWidth: 1, lineStyle: 3, title: "MA50 +25% extended" })
      : null;

    const flat = (value: number) => chart.candles.map((c) => ({ time: asTime(c.time), value }));

    const zoneBase = {
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    } as const;

    let epZones: { green: ISeriesApi<"Baseline">; red: ISeriesApi<"Baseline"> } | null = null;
    let epLines: ReturnType<typeof makeTogglableLine>[] | null = null;
    const ep = chart.entryPlan;
    if (ep) {
      const green = main.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: ep.pivot },
        topFillColor1: "rgba(38, 166, 154, 0.25)",
        topFillColor2: "rgba(38, 166, 154, 0.05)",
        topLineColor: "rgba(38, 166, 154, 0)",
        bottomFillColor1: "rgba(0, 0, 0, 0)",
        bottomFillColor2: "rgba(0, 0, 0, 0)",
        bottomLineColor: "rgba(0, 0, 0, 0)",
        ...zoneBase,
      });
      green.setData(flat(ep.target2));
      const red = main.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: ep.pivot },
        topFillColor1: "rgba(0, 0, 0, 0)",
        topFillColor2: "rgba(0, 0, 0, 0)",
        topLineColor: "rgba(0, 0, 0, 0)",
        bottomFillColor1: "rgba(239, 83, 80, 0.05)",
        bottomFillColor2: "rgba(239, 83, 80, 0.25)",
        bottomLineColor: "rgba(239, 83, 80, 0)",
        ...zoneBase,
      });
      red.setData(flat(ep.stop));
      epZones = { green, red };
      epLines = [
        makeTogglableLine(candle, { price: ep.pivot, color: theme.up, lineWidth: 2, lineStyle: 0, title: `买入 pivot $${ep.pivot.toFixed(2)}` }),
        makeTogglableLine(candle, { price: ep.buy_zone_high, color: theme.up, lineWidth: 1, lineStyle: 2, title: "买入区上限 +5%" }),
        makeTogglableLine(candle, { price: ep.stop, color: theme.down, lineWidth: 2, lineStyle: 2, title: `止损 $${ep.stop.toFixed(2)}` }),
        makeTogglableLine(candle, { price: ep.target1, color: theme.accent, lineWidth: 1, lineStyle: 2, title: `T1 +${ep.target1_pct.toFixed(0)}% $${ep.target1.toFixed(2)}` }),
        makeTogglableLine(candle, { price: ep.target2, color: seriesPalette[1], lineWidth: 1, lineStyle: 2, title: `T2 +${ep.target2_pct.toFixed(0)}% $${ep.target2.toFixed(2)}` }),
      ];
    }

    const zoneLayers = chart.supportZones.map((z) => {
      const series = main.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: z.high },
        topFillColor1: "rgba(0,0,0,0)",
        topFillColor2: "rgba(0,0,0,0)",
        topLineColor: "rgba(0,0,0,0)",
        bottomFillColor1: z.fill,
        bottomFillColor2: z.fill,
        bottomLineColor: z.border,
        ...zoneBase,
      });
      series.setData(flat(z.low));
      const line = makeTogglableLine(candle, {
        price: (z.high + z.low) / 2,
        color: z.border,
        lineWidth: 0,
        lineStyle: 0,
        title: `${z.label} $${z.low.toFixed(0)}-${z.high.toFixed(0)}`,
      });
      return { series, line, info: z };
    });

    const volSeries = main.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol" });
    main.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    main.priceScale("right").applyOptions({ scaleMargins: { top: 0.06, bottom: 0.24 } });
    volSeries.setData(toVolumeData(chart.volumes));

    let vpEnabled = true;
    const vpCtx = vpCanvas.getContext("2d");
    const drawVolumeProfile = () => {
      if (!vpCtx) return;
      const rect = mainEl.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      vpCanvas.style.width = `${VP_WIDTH}px`;
      vpCanvas.style.height = `${rect.height}px`;
      vpCanvas.width = VP_WIDTH * dpr;
      vpCanvas.height = rect.height * dpr;
      vpCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      vpCtx.clearRect(0, 0, VP_WIDTH, rect.height);
      if (!vpEnabled || !chart.volumeProfile.bins.length) return;
      const bins = chart.volumeProfile.bins;
      const drawW = VP_WIDTH - 14;
      bins.forEach((b) => {
        const yHi = candle.priceToCoordinate(b.high);
        const yLo = candle.priceToCoordinate(b.low);
        if (yHi == null || yLo == null) return;
        const top = Math.min(yHi, yLo);
        const h = Math.max(1, Math.abs(yLo - yHi) - 0.5);
        const w = Math.max(1, b.pct * drawW);
        vpCtx.fillStyle = "rgba(154, 154, 154, 0.55)";
        vpCtx.fillRect(VP_WIDTH - w - 2, top, w, h);
      });
      const poc = bins.reduce((a, b) => (b.weight > a.weight ? b : a), bins[0]);
      if (poc) {
        const yHi = candle.priceToCoordinate(poc.high);
        const yLo = candle.priceToCoordinate(poc.low);
        if (yHi != null && yLo != null) {
          const top = Math.min(yHi, yLo);
          const h = Math.max(1, Math.abs(yLo - yHi));
          vpCtx.fillStyle = "rgba(255, 176, 0, 0.85)";
          vpCtx.fillRect(VP_WIDTH - drawW - 2, top, drawW, h);
          vpCtx.fillStyle = theme.accent;
          vpCtx.font = "10px -apple-system, sans-serif";
          vpCtx.textAlign = "right";
          vpCtx.fillText("POC", VP_WIDTH - 4, top + h / 2 + 3);
        }
      }
    };
    let vpRaf: number | null = null;
    const scheduleVpDraw = () => {
      if (vpRaf) return;
      vpRaf = requestAnimationFrame(() => {
        vpRaf = null;
        drawVolumeProfile();
      });
    };
    main.timeScale().subscribeVisibleLogicalRangeChange(scheduleVpDraw);
    main.subscribeCrosshairMove(scheduleVpDraw);
    const vpRo = new ResizeObserver(scheduleVpDraw);
    vpRo.observe(mainEl);
    const vpTimer = setTimeout(drawVolumeProfile, 200);
    const vpInterval = setInterval(scheduleVpDraw, 250);

    const timeline = chart.candles.map((c) => c.time);
    const rsChart = baseChart(rsEl, false);
    const rsOpts = { lineWidth: 2 as const, priceLineVisible: false, lastValueVisible: true };
    const rs21 = rsChart.addSeries(LineSeries, { color: seriesPalette[2], ...rsOpts });
    const rs63 = rsChart.addSeries(LineSeries, { color: seriesPalette[4], ...rsOpts });
    const rs126 = rsChart.addSeries(LineSeries, { color: seriesPalette[3], ...rsOpts });
    rs21.setData(padLineData(chart.rs21, timeline));
    rs63.setData(padLineData(chart.rs63, timeline));
    rs126.setData(padLineData(chart.rs126, timeline));
    if (chart.rs21.length) {
      rs21.createPriceLine({ price: 0, color: theme.borderStrong, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
    }

    const vrChart = baseChart(vrEl, false);
    const vr = vrChart.addSeries(HistogramSeries, { priceLineVisible: false });
    vr.setData(padHistData(chart.volRatio, timeline));
    vr.createPriceLine({ price: 1.5, color: theme.down, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "1.5×" });
    vr.createPriceLine({ price: 1.0, color: theme.borderStrong, lineWidth: 1, lineStyle: 3, axisLabelVisible: false, title: "" });

    const stopTimeScaleSync = syncTimeScales([main, rsChart, vrChart]);
    showLastBars(main, chart.candles);

    const observers = [observeSize(mainEl, main), observeSize(rsEl, rsChart), observeSize(vrEl, vrChart)];

    const nextGroups: LayerGroup[] = [
      {
        title: "均线",
        items: [
          { key: "ma50", label: "MA50", color: seriesPalette[0], toggle: (v) => ma50.applyOptions({ visible: v }) },
          { key: "ma150", label: "MA150", color: seriesPalette[4], toggle: (v) => ma150.applyOptions({ visible: v }) },
          { key: "ma200", label: "MA200", color: seriesPalette[1], toggle: (v) => ma200.applyOptions({ visible: v }) },
        ],
      },
      {
        title: "价位线",
        items: [
          { key: "h52w", label: "52w 高", color: seriesPalette[4], toggle: (v) => lineH52w.set(v) },
          { key: "l52w", label: "52w 低", color: theme.up, toggle: (v) => lineL52w.set(v) },
          ...(lineExt ? [{ key: "ext", label: "MA50 +25%", color: theme.down, toggle: (v: boolean) => lineExt.set(v) }] : []),
        ],
      },
    ];
    if (zoneLayers.length) {
      nextGroups.push({
        title: "支撑区",
        items: zoneLayers.map((zl, i) => ({
          key: `zone${i}`,
          label: zl.info.label,
          color: zl.info.border,
          toggle: (v) => {
            zl.series.applyOptions({ visible: v });
            zl.line.set(v);
          },
        })),
      });
    }
    if (epZones && epLines) {
      const zones = epZones;
      const lines = epLines;
      nextGroups.push({
        title: "入场计划",
        items: [
          {
            key: "ep-zone",
            label: "盈亏区域",
            color: theme.up,
            toggle: (v) => {
              zones.green.applyOptions({ visible: v });
              zones.red.applyOptions({ visible: v });
            },
          },
          { key: "ep-line", label: "pivot / 止损 / T1 / T2", color: theme.accent, toggle: (v) => lines.forEach((l) => l.set(v)) },
        ],
      });
    }
    nextGroups.push({
      title: "其他",
      items: [
        { key: "vol", label: "成交量", color: theme.up, toggle: (v) => volSeries.applyOptions({ visible: v }) },
        { key: "markers", label: "事件标记", color: theme.down, toggle: (v) => candleMarkers.setMarkers(v ? toMarkers(chart.markers) : []) },
        {
          key: "vp",
          label: "成交分布 (VP)",
          color: theme.accent,
          toggle: (v) => {
            vpEnabled = v;
            drawVolumeProfile();
          },
        },
      ],
    });
    setGroups(nextGroups);

    return () => {
      clearTimeout(vpTimer);
      clearInterval(vpInterval);
      if (vpRaf) cancelAnimationFrame(vpRaf);
      vpRo.disconnect();
      observers.forEach((ro) => ro.disconnect());
      stopTimeScaleSync();
      main.remove();
      rsChart.remove();
      vrChart.remove();
      setGroups([]);
    };
  }, [chart, mainRef, rsRef, vrRef, vpCanvasRef]);

  return groups;
}
