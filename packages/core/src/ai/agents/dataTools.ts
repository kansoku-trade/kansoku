import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import type { Annotation, NewsItem, RawBar } from '@kansoku/shared/types';
import type { ReassessPack } from './datapack.js';

const KLINE_MAX_COUNT = 500;
const KLINE_DEFAULT_COUNT = 200;

const KLINE_PERIODS: Record<string, string> = { m5: '5m', m15: '15m', h1: '1h', day: 'day' };

const klineSchema = Type.Object({
  period: Type.Union([
    Type.Literal('m5'),
    Type.Literal('m15'),
    Type.Literal('h1'),
    Type.Literal('day'),
  ]),
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
    Type.Literal('trendline'),
    Type.Literal('hline'),
    Type.Literal('rect'),
    Type.Literal('fib'),
    Type.Literal('polyline'),
  ]),
  points: Type.Array(annotationPointSchema),
  label: Type.String(),
  style: Type.Optional(annotationStyleSchema),
});

const drawAnnotationsSchema = Type.Object({
  annotations: Type.Array(drawAnnotationItemSchema, { maxItems: MAX_ANNOTATIONS_PER_CALL }),
});

const etTimestampFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function formatEtTimestamp(unixSeconds: number): string {
  const parts = etTimestampFormatter.formatToParts(new Date(unixSeconds * 1000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} ET`;
}

export function textResult(
  text: string,
  terminate = false,
): AgentToolResult<Record<string, never>> {
  return { content: [{ type: 'text' as const, text }], details: {}, terminate };
}

function clampCount(count: number | undefined): number {
  if (count == null || !Number.isFinite(count)) return KLINE_DEFAULT_COUNT;
  return Math.max(1, Math.min(KLINE_MAX_COUNT, Math.floor(count)));
}

export function buildDataPackTool(
  symbol: string,
  opts: {
    buildPack: (symbol: string) => Promise<ReassessPack>;
    onPack?: (pack: ReassessPack) => void;
  },
): AgentTool {
  let cachedPack: ReassessPack | null = null;

  return {
    name: 'read_data_pack',
    label: 'Read Data Pack',
    description:
      'Fetch a multi-period snapshot for this symbol: bar summaries, capital flow, relative volume, intraday key levels, SPY/QQQ market references, news, archived predictions, and positions.',
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
    name: 'fetch_kline',
    label: 'Fetch K-line',
    description: 'Fetch additional bars for one period. period is limited to m5/m15/h1/day and count is capped at 500.',
    parameters: klineSchema,
    execute: async (_id, params) => {
      const period = KLINE_PERIODS[params.period];
      const count = clampCount(params.count);
      const bars = await fetchKline(symbol, period, count);
      return textResult(JSON.stringify({ period: params.period, count, bars }));
    },
  };
}

export function buildNewsTool(
  symbol: string,
  fetchNews: (symbol: string) => Promise<NewsItem[]>,
): AgentTool {
  return {
    name: 'fetch_news',
    label: 'Fetch News',
    description: 'Fetch recent news and catalysts for this symbol.',
    parameters: Type.Object({}),
    execute: async () => textResult(JSON.stringify(await fetchNews(symbol))),
  };
}

export function buildReadDrawingsTool(
  symbol: string,
  readAnnotations: (symbol: string) => Promise<Annotation[]>,
): AgentTool {
  return {
    name: 'read_drawings',
    label: 'Read Drawings',
    description:
      'Read existing annotations on the current symbol\'s chart (trend lines, horizontal lines, rectangles, Fibonacci retracements, and polylines), including user drawings and previous AI drawings. Call this before drawing to avoid duplicates.',
    parameters: Type.Object({}),
    execute: async () => {
      const annotations = await readAnnotations(symbol);
      if (annotations.length === 0) {
        return textResult(
          JSON.stringify({ count: 0, drawings: [], note: 'There are no annotations on the current chart.' }),
        );
      }
      const drawings = annotations.map((a) => ({
        id: a.id,
        kind: a.kind,
        source: a.source ?? 'user',
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
    name: 'draw_annotations',
    label: 'Draw Annotations',
    description:
      'Draw annotations on the current symbol\'s chart: trendline (2 points), hline (1 point), rect (2 points), fib (2 points), or polyline (2–20 points). ' +
      'Use a polyline to connect several price movements in chronological order; arrow applies only to trendline and polyline. ' +
      'Each point uses Unix seconds for time and price for price. label is required and must explain the reason for the annotation in plain language; explain any necessary technical term in brackets. ' +
      'Draw at most four annotations in one call. This only adds to existing annotations and never modifies or deletes any user or prior AI annotation.',
    parameters: drawAnnotationsSchema,
    execute: async (_id, params) => {
      const items = params.annotations;
      if (!items.length) return textResult('rejected: annotations must not be empty; there is nothing to draw.');
      if (items.length > MAX_ANNOTATIONS_PER_CALL) {
        return textResult(
          `rejected: at most ${MAX_ANNOTATIONS_PER_CALL} annotations are allowed per call; ${items.length} were submitted. Split them across turns.`,
        );
      }
      for (let i = 0; i < items.length; i++) {
        if (!items[i].label || !items[i].label.trim()) {
          return textResult(`rejected: annotation ${i + 1} lacks a label; every annotation must explain its reason.`);
        }
      }

      const nowMs = deps.now();
      const created: Annotation[] = items.map((item) => ({
        id: deps.genId(),
        kind: item.kind,
        points: item.points,
        createdAt: nowMs,
        source: 'ai',
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

      const summary = created.map((a) => `${a.id} (${a.kind}): ${a.label}`).join('; ');
      return textResult(`Created ${created.length} annotation(s): ${summary}`);
    },
  };
}
