import { ClientError } from "../errors.js";

const UP_COLOR = "#22c55e";
const DOWN_COLOR = "#ef4444";

export interface FlowRow {
  time: string;
  inflow: string | number;
}

export interface CohortRow {
  symbol?: string;
  label?: string;
  value: string | number;
  group?: string;
}

function splitBySign(rows: FlowRow[]): { pos: [number, number | null][]; neg: [number, number | null][] } {
  const pos: [number, number | null][] = [];
  const neg: [number, number | null][] = [];
  let prev: [number, number] | null = null;
  for (const row of rows) {
    const t = Date.parse(row.time);
    const v = Number(row.inflow);
    if (prev && prev[1] * v < 0) {
      const [t0, v0] = prev;
      const tz = t0 + ((0 - v0) * (t - t0)) / (v - v0);
      pos.push([tz, 0]);
      neg.push([tz, 0]);
    }
    pos.push([t, v >= 0 ? v : null]);
    neg.push([t, v <= 0 ? v : null]);
    prev = [t, v];
  }
  return { pos, neg };
}

export function buildFlowOption(rows: FlowRow[]): Record<string, unknown> {
  const { pos, neg } = splitBySign(rows);
  const seriesBase = {
    type: "line",
    smooth: true,
    symbol: "none",
    lineStyle: { width: 2 },
    areaStyle: { opacity: 0.18 },
  };
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    grid: { left: "8%", right: "5%", top: 40, bottom: 60 },
    xAxis: {
      type: "time",
      axisLine: { lineStyle: { color: "#666" } },
      axisLabel: { color: "#aaa" },
    },
    yAxis: {
      type: "value",
      name: "累计主力净流入",
      nameTextStyle: { color: "#aaa" },
      axisLine: { lineStyle: { color: "#666" } },
      axisLabel: { color: "#aaa" },
      splitLine: { lineStyle: { color: "#1f242c" } },
    },
    dataZoom: [
      { type: "inside" },
      { type: "slider", height: 18, bottom: 18, borderColor: "#333" },
    ],
    series: [
      {
        ...seriesBase,
        name: "净流入",
        data: pos,
        itemStyle: { color: UP_COLOR },
        markLine: {
          symbol: "none",
          silent: true,
          lineStyle: { color: "#888", type: "dashed" },
          data: [{ yAxis: 0 }],
          label: { show: false },
        },
      },
      {
        ...seriesBase,
        name: "净流出",
        data: neg,
        itemStyle: { color: DOWN_COLOR },
      },
    ],
  };
}

export function buildCohortOption(rows: CohortRow[]): Record<string, unknown> {
  const cleaned = rows.map((row) => {
    const label = row.label ?? row.symbol;
    if (label == null) {
      throw new ClientError("cohort rows need `label` or `symbol`", `offending row: ${JSON.stringify(row)}`);
    }
    return { label: String(label), value: Number(row.value) };
  });
  cleaned.sort((a, b) => a.value - b.value);

  return {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "rgba(20,24,30,0.92)",
      borderColor: "#333",
      textStyle: { color: "#eee" },
    },
    grid: { left: "14%", right: "10%", top: 20, bottom: 30 },
    xAxis: {
      type: "value",
      axisLine: { lineStyle: { color: "#666" } },
      axisLabel: { color: "#aaa" },
      splitLine: { lineStyle: { color: "#1f242c" } },
    },
    yAxis: {
      type: "category",
      data: cleaned.map((c) => c.label),
      axisLine: { lineStyle: { color: "#666" } },
      axisLabel: { color: "#ddd", fontSize: 12 },
    },
    series: [
      {
        type: "bar",
        data: cleaned.map((c) => ({
          value: c.value,
          itemStyle: { color: c.value >= 0 ? UP_COLOR : DOWN_COLOR },
        })),
        label: {
          show: true,
          position: "right",
          color: "#ddd",
          fontSize: 11,
        },
        barWidth: "60%",
      },
    ],
  };
}
