import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import type { Annotation, NewsItem, RawBar } from "@kansoku/shared/types";
import type { ReassessPack } from "./datapack.js";

const KLINE_MAX_COUNT = 500;
const KLINE_DEFAULT_COUNT = 200;

const KLINE_PERIODS: Record<string, string> = { m5: "5m", m15: "15m", h1: "1h", day: "day" };

const klineSchema = Type.Object({
  period: Type.Union([Type.Literal("m5"), Type.Literal("m15"), Type.Literal("h1"), Type.Literal("day")]),
  count: Type.Optional(Type.Number()),
});

const MAX_ANNOTATIONS_PER_CALL = 4;

const annotationPointSchema = Type.Object({
  time: Type.Number(),
  price: Type.Number(),
});

const annotationStyleSchema = Type.Object({
  color: Type.Optional(Type.String()),
  width: Type.Optional(Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3)])),
  dash: Type.Optional(Type.Boolean()),
  arrow: Type.Optional(Type.Boolean()),
});

const drawAnnotationItemSchema = Type.Object({
  kind: Type.Union([
    Type.Literal("trendline"),
    Type.Literal("hline"),
    Type.Literal("rect"),
    Type.Literal("fib"),
    Type.Literal("polyline"),
  ]),
  points: Type.Array(annotationPointSchema),
  label: Type.String(),
  style: Type.Optional(annotationStyleSchema),
});

const drawAnnotationsSchema = Type.Object({
  annotations: Type.Array(drawAnnotationItemSchema, { maxItems: MAX_ANNOTATIONS_PER_CALL }),
});

const etTimestampFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatEtTimestamp(unixSeconds: number): string {
  const parts = etTimestampFormatter.formatToParts(new Date(unixSeconds * 1000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} ET`;
}

export function textResult(text: string, terminate = false): AgentToolResult<Record<string, never>> {
  return { content: [{ type: "text" as const, text }], details: {}, terminate };
}

function clampCount(count: number | undefined): number {
  if (count == null || !Number.isFinite(count)) return KLINE_DEFAULT_COUNT;
  return Math.max(1, Math.min(KLINE_MAX_COUNT, Math.floor(count)));
}

export function buildDataPackTool(
  symbol: string,
  opts: { buildPack: (symbol: string) => Promise<ReassessPack>; onPack?: (pack: ReassessPack) => void },
): AgentTool {
  let cachedPack: ReassessPack | null = null;

  return {
    name: "read_data_pack",
    label: "Read Data Pack",
    description: "拉取该标的的多周期快照：K 线摘要、资金流、相对成交量、日内关键价位、大盘参照 SPY/QQQ、新闻、已归档预测、持仓。",
    parameters: Type.Object({}),
    execute: async () => {
      if (!cachedPack) {
        cachedPack = await opts.buildPack(symbol);
        opts.onPack?.(cachedPack);
      }
      return textResult(JSON.stringify(cachedPack));
    },
  };
}

export function buildKlineTool(
  symbol: string,
  fetchKline: (symbol: string, period: string, count: number) => Promise<RawBar[]>,
): AgentTool<typeof klineSchema> {
  return {
    name: "fetch_kline",
    label: "Fetch K-line",
    description: "补拉某个周期的 K 线。period 限 m5/m15/h1/day，count 上限 500。",
    parameters: klineSchema,
    execute: async (_id, params) => {
      const period = KLINE_PERIODS[params.period];
      const count = clampCount(params.count);
      const bars = await fetchKline(symbol, period, count);
      return textResult(JSON.stringify({ period: params.period, count, bars }));
    },
  };
}

export function buildNewsTool(symbol: string, fetchNews: (symbol: string) => Promise<NewsItem[]>): AgentTool {
  return {
    name: "fetch_news",
    label: "Fetch News",
    description: "拉取该标的最近的新闻与催化消息。",
    parameters: Type.Object({}),
    execute: async () => textResult(JSON.stringify(await fetchNews(symbol))),
  };
}

export function buildReadDrawingsTool(
  symbol: string,
  readAnnotations: (symbol: string) => Promise<Annotation[]>,
): AgentTool {
  return {
    name: "read_drawings",
    label: "Read Drawings",
    description:
      "读取当前标的图表上已有的画线（趋势线/水平线/矩形/斐波那契回撤/折线 polyline），含用户画的和 AI 自己之前画的。" +
      "画新线前先调用它，避免画出和已有线重复的线。",
    parameters: Type.Object({}),
    execute: async () => {
      const annotations = await readAnnotations(symbol);
      if (annotations.length === 0) {
        return textResult(JSON.stringify({ count: 0, drawings: [], note: "当前图表上没有任何画线" }));
      }
      const drawings = annotations.map((a) => ({
        id: a.id,
        kind: a.kind,
        source: a.source ?? "user",
        label: a.label ?? null,
        createdAt: a.createdAt,
        points: a.points.map((p) => ({ price: p.price, time: formatEtTimestamp(p.time) })),
      }));
      return textResult(JSON.stringify({ count: drawings.length, drawings }));
    },
  };
}

export function buildDrawAnnotationsTool(
  symbol: string,
  deps: {
    readAnnotations: (symbol: string) => Promise<Annotation[]>;
    writeAnnotations: (symbol: string, annotations: Annotation[]) => Promise<void>;
    now: () => number;
    genId: () => string;
  },
): AgentTool<typeof drawAnnotationsSchema> {
  return {
    name: "draw_annotations",
    label: "Draw Annotations",
    description:
      "在当前标的图表上画线：趋势线 trendline（2 点）/ 水平线 hline（1 点）/ 矩形 rect（2 点）/ 斐波那契回撤 fib（2 点）/ 折线 polyline（2–20 点）。" +
      "polyline 用于把多段走势连成一条折线（2–20 个点，按时间顺序）；arrow 仅对 trendline/polyline 有意义。" +
      "points 里 time 是 unix 秒、price 是价格；label 必须写，用中文白话说明画这条线的理由，不用行话（确实要用的术语要加方括号白话注解）。" +
      "一次调用最多画 4 条。只会在已有画线基础上追加，绝不修改或删除已有的线，无论是用户画的还是 AI 自己之前画的。",
    parameters: drawAnnotationsSchema,
    execute: async (_id, params) => {
      const items = params.annotations;
      if (!items.length) return textResult("rejected: annotations 不能为空数组，没有可画的线。");
      if (items.length > MAX_ANNOTATIONS_PER_CALL) {
        return textResult(
          `rejected: 一次最多画 ${MAX_ANNOTATIONS_PER_CALL} 条，本次提交了 ${items.length} 条，请拆分成多轮。`,
        );
      }
      for (let i = 0; i < items.length; i++) {
        if (!items[i].label || !items[i].label.trim()) {
          return textResult(`rejected: 第 ${i + 1} 条缺少 label，画线必须说明理由。`);
        }
      }

      const nowMs = deps.now();
      const created: Annotation[] = items.map((item) => ({
        id: deps.genId(),
        kind: item.kind,
        points: item.points,
        createdAt: nowMs,
        source: "ai",
        label: item.label,
        ...(item.style ? { style: item.style } : {}),
      }));

      const existing = await deps.readAnnotations(symbol);
      try {
        await deps.writeAnnotations(symbol, [...existing, ...created]);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return textResult(`rejected: ${message}`);
      }

      const summary = created.map((a) => `${a.id}（${a.kind}）：${a.label}`).join("；");
      return textResult(`已画 ${created.length} 条：${summary}`);
    },
  };
}
