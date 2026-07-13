import type { ChartBuilt, ChartDoc, ChartType, RawBar } from "../../../../shared/types.js";
import { ClientError } from "../errors.js";
import { ymd } from "./indicators.js";
import { buildIntraday, TIMEFRAME_ORDER, type IntradayInput } from "./intraday.js";
import { getProvider } from "./marketdata/registry.js";
import { getEventRisk } from "./events.js";
import { getOptionsLevels } from "./optionsLevels.js";
import { resolveSecurityName } from "./securityName.js";
import { buildSepa, type SepaInput } from "./sepa.js";
import { cleanCohortRows, type CohortRow, type FlowRow } from "./simple.js";

export const ALL_TYPES: ChartType[] = ["flow", "cohort", "sepa", "intraday"];

const TF_PERIODS: Record<string, string> = { m5: "5m", m15: "15m", h1: "1h" };

// Daily bars barely move intraday; without this every 60s live rebuild would
// re-hit the provider for the same 60 bars.
const DAY_KLINE_TTL_MS = 10 * 60_000;
const dayKlineCache = new Map<string, { at: number; bars: RawBar[] }>();

async function getDayKlineCached(symbol: string): Promise<RawBar[]> {
  const hit = dayKlineCache.get(symbol);
  if (hit && Date.now() - hit.at < DAY_KLINE_TTL_MS) return hit.bars;
  const bars = await getProvider()
    .getKline(symbol, "day", 60)
    .catch(() => [] as RawBar[]);
  if (bars.length) dayKlineCache.set(symbol, { at: Date.now(), bars });
  return bars;
}

export function slugify(s: string, fallback: string): string {
  const cleaned = s
    .replace(/[^\p{L}\p{N}_\s-]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  return cleaned || fallback;
}

function symbolSlug(symbol: string, suffix: string): string {
  const sym = symbol.replace(/\.(US|HK)$/i, "").toLowerCase();
  return `${slugify(sym, "chart")}-${suffix}`;
}

function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface BuildResult {
  type: ChartType;
  title: string;
  slug: string;
  symbol: string | null;
  sessionDate: string;
  input: Record<string, unknown>;
  built: ChartBuilt;
  meta: Record<string, unknown>;
}

type Body = Record<string, unknown>;

function requireSymbol(body: Body, type: string): string {
  const symbol = body.symbol;
  if (typeof symbol !== "string" || !symbol) {
    throw new ClientError(`${type}: \`symbol\` is required when \`data\` is not provided`, "e.g. {\"type\": \"" + type + "\", \"symbol\": \"NVDA.US\"}");
  }
  return symbol;
}

async function prepareInput(type: ChartType, body: Body): Promise<Record<string, unknown>> {
  switch (type) {
    case "sepa": {
      const symbol = requireSymbol(body, "sepa");
      const count = Number(body.count ?? 260);
      const provider = getProvider();
      const [kline, spyKline, news, name] = await Promise.all([
        (async () => (body.kline as RawBar[] | undefined) ?? (await provider.getKline(symbol, "day", count)))(),
        (async () =>
          (body.spy_kline as RawBar[] | undefined) ??
          (body.skip_spy === true ? [] : await provider.getKline("SPY.US", "day", count)))(),
        provider.getNews(symbol),
        resolveSecurityName(symbol, body.name, provider),
      ]);
      return {
        symbol,
        name,
        as_of_date: body.as_of_date,
        kline,
        spy_kline: spyKline,
        news,
        position: body.position,
        context: body.context,
      };
    }
    case "intraday": {
      const symbol = requireSymbol(body, "intraday");
      const count = Number(body.count ?? 1000);
      const session = typeof body.session === "string" ? body.session : "all";
      let timeframes = body.timeframes as Record<string, RawBar[]> | undefined;
      let dayKline = body.day_kline as RawBar[] | undefined;
      const provider = getProvider();
      const namePromise = resolveSecurityName(symbol, body.name, provider);
      const newsPromise = provider.getNews(symbol);
      const optionsPromise = getOptionsLevels(symbol);
      const eventRiskPromise = getEventRisk(symbol).catch(() => null);
      if (!timeframes) {
        const [m5, m15, h1] = await Promise.all(
          TIMEFRAME_ORDER.map((k) => provider.getKline(symbol, TF_PERIODS[k], count, session)),
        );
        timeframes = { m5, m15, h1 };
      }
      if (!dayKline) {
        dayKline = await getDayKlineCached(symbol);
      }
      const lastM5 = timeframes.m5?.[timeframes.m5.length - 1];
      return {
        symbol,
        name: await namePromise,
        as_of: body.as_of ?? lastM5?.time,
        session,
        timeframes,
        day_kline: dayKline,
        ema_periods: body.ema_periods,
        news: await newsPromise,
        options_levels: await optionsPromise,
        event_risk: await eventRiskPromise,
        position: body.position,
        prediction: body.prediction ?? null,
        context: body.context ?? null,
        origin: body.origin ?? null,
      };
    }
    case "flow": {
      let rows = body.data as FlowRow[] | undefined;
      let symbol = typeof body.symbol === "string" ? body.symbol : null;
      if (!rows) {
        symbol = requireSymbol(body, "flow");
        const provider = getProvider();
        if (!provider.getFlow) {
          throw new ClientError(
            `flow: provider "${provider.name}" has no capital-flow data`,
            "pass `data` explicitly or switch MARKET_PROVIDER to one with the flow capability",
          );
        }
        rows = await provider.getFlow(symbol);
      }
      return { symbol, rows, subtitle: body.subtitle ?? "" };
    }
    case "cohort": {
      const rows = body.data as CohortRow[] | undefined;
      if (!Array.isArray(rows) || !rows.length) {
        throw new ClientError("cohort: `data` must be a non-empty array", 'e.g. [{"symbol": "MU", "value": -17087}]');
      }
      return { rows, subtitle: body.subtitle ?? "" };
    }
  }
}

export function rebuild(type: ChartType, input: Record<string, unknown>, title?: string): Omit<BuildResult, "input"> & { input: Record<string, unknown> } {
  switch (type) {
    case "sepa": {
      const { built, meta } = buildSepa(input as unknown as SepaInput);
      const symbol = built.sidebar.symbol;
      const sessionDate = ymd(built.sidebar.asOf) || localToday();
      return {
        type,
        title: title || `${symbol} SEPA Dashboard`,
        slug: symbolSlug(symbol, "sepa"),
        symbol,
        sessionDate,
        input,
        built,
        meta,
      };
    }
    case "intraday": {
      const { built, meta } = buildIntraday(input as unknown as IntradayInput);
      const symbol = built.sidebar.symbol;
      const asOf = built.sidebar.asOf;
      const sessionDate = asOf ? ymd(asOf) : localToday();
      return {
        type,
        title: title || `${symbol} 短线多周期`,
        slug: symbolSlug(symbol, "intraday"),
        symbol,
        sessionDate,
        input,
        built,
        meta,
      };
    }
    case "flow":
    case "cohort": {
      const rows = input.rows as Record<string, unknown>[];
      if (!Array.isArray(rows) || !rows.length) {
        throw new ClientError(`${type}: input rows must be a non-empty array`);
      }
      const symbol = typeof input.symbol === "string" ? input.symbol : null;
      const subtitle = String(input.subtitle ?? "");
      let built: ChartBuilt;
      let defaultTitle: string;
      let slug: string;
      if (type === "flow") {
        built = { kind: "simple", chartType: "flow", rows: rows as unknown as FlowRow[], subtitle };
        defaultTitle = symbol ? `${symbol} 主力资金流` : "主力资金流";
        slug = symbol ? symbolSlug(symbol, "flow") : "flow";
      } else {
        built = { kind: "simple", chartType: "cohort", rows: cleanCohortRows(rows as unknown as CohortRow[]), subtitle };
        defaultTitle = "cohort 对比";
        slug = title ? slugify(title, "cohort") : "cohort";
      }
      const lastTime = rows[rows.length - 1]?.time;
      const sessionDate = type === "flow" && typeof lastTime === "string" ? ymd(lastTime) : localToday();
      return {
        type,
        title: title || defaultTitle,
        slug,
        symbol,
        sessionDate,
        input,
        built,
        meta: { rows: rows.length },
      };
    }
  }
}

export function migrateLegacyDoc(doc: ChartDoc): ChartDoc {
  const kind = (doc.built as { kind?: string } | undefined)?.kind;
  const needsRebuild = kind === "echarts" || (kind === "intraday" && hasLegacyOffSession(doc.built));
  if (!needsRebuild) return doc;
  try {
    return { ...doc, built: rebuild(doc.type, doc.input, doc.title).built };
  } catch {
    return doc;
  }
}

function hasLegacyOffSession(built: unknown): boolean {
  const tfs = (built as { timeframes?: Record<string, { offSession?: unknown[] }> } | undefined)?.timeframes;
  if (!tfs) return false;
  for (const k of Object.keys(tfs)) {
    const first = tfs[k]?.offSession?.[0] as { time?: unknown; startTime?: unknown } | undefined;
    if (first && "time" in first && !("startTime" in first)) return true;
  }
  return false;
}

export async function buildChart(body: Body): Promise<BuildResult> {
  const type = body.type as ChartType;
  if (!ALL_TYPES.includes(type)) {
    throw new ClientError(
      `unknown chart type: ${JSON.stringify(body.type)}`,
      `type must be one of ${ALL_TYPES.join(" | ")}`,
    );
  }
  const input = await prepareInput(type, body);
  const title = typeof body.title === "string" && body.title ? body.title : undefined;
  return rebuild(type, input, title);
}

export function refreshBody(type: ChartType, input: Record<string, unknown>): Record<string, unknown> | null {
  const symbol = input.symbol;
  if (typeof symbol !== "string" || !symbol) return null;
  switch (type) {
    case "flow":
      return { type, symbol, subtitle: input.subtitle };
    case "intraday":
      return {
        type,
        symbol,
        name: input.name,
        session: input.session ?? "all",
        ema_periods: input.ema_periods,
        position: input.position,
        prediction: input.prediction,
        context: input.context,
        origin: input.origin,
      };
    case "sepa":
      return { type, symbol, name: input.name, position: input.position, context: input.context };
    case "cohort":
      return null;
  }
}

const PATCHABLE: Record<ChartType, string[]> = {
  sepa: ["name", "as_of_date", "position", "context"],
  intraday: ["name", "as_of", "position", "prediction", "session", "context"],
  flow: ["subtitle"],
  cohort: ["subtitle"],
};

export function mergeForPatch(type: ChartType, input: Record<string, unknown>, body: Body): Record<string, unknown> {
  const merged = { ...input };
  for (const key of PATCHABLE[type]) {
    if (key in body) merged[key] = body[key];
  }
  if ((type === "flow" || type === "cohort") && Array.isArray(body.data)) {
    merged.rows = body.data;
  }
  return merged;
}
