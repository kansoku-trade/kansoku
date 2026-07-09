import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    ts: text("ts").notNull(),
    easternDate: text("eastern_date").notNull(),
    symbol: text("symbol").notNull(),
    level: text("level").notNull(),
    text: text("text").notNull(),
    trigger: text("trigger"),
    source: text("source").notNull(),
    escalated: integer("escalated", { mode: "boolean" }),
    chartId: text("chart_id"),
  },
  (t) => [index("comments_symbol_date").on(t.symbol, t.easternDate)],
);

export const aiUsage = sqliteTable(
  "ai_usage",
  {
    id: text("id").primaryKey(),
    ts: text("ts").notNull(),
    easternDate: text("eastern_date").notNull(),
    layer: text("layer").notNull(),
    symbol: text("symbol").notNull(),
    model: text("model").notNull(),
    origin: text("origin"),
    calls: integer("calls").notNull(),
    totalTokens: integer("total_tokens").notNull(),
    input: integer("input").notNull(),
    output: integer("output").notNull(),
    cacheRead: integer("cache_read").notNull(),
    cacheWrite: integer("cache_write").notNull(),
    costTotal: real("cost_total").notNull(),
  },
  (t) => [index("ai_usage_date").on(t.easternDate)],
);

export const chartMeta = sqliteTable(
  "chart_meta",
  {
    id: text("id").primaryKey(),
    schemaVersion: integer("schema_version").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    symbol: text("symbol"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    predictionUpdatedAt: text("prediction_updated_at"),
  },
  (t) => [index("chart_meta_type").on(t.type), index("chart_meta_symbol").on(t.symbol)],
);

export const outcomes = sqliteTable("outcomes", {
  chartId: text("chart_id").primaryKey(),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(),
  status: text("status").notNull(),
  pctSinceAnchor: real("pct_since_anchor").notNull(),
  resolvedAt: integer("resolved_at").notNull(),
  judgedAt: text("judged_at").notNull(),
});

export const chatSessions = sqliteTable(
  "chat_sessions",
  {
    id: text("id").primaryKey(),
    chartId: text("chart_id").notNull().unique(),
    symbol: text("symbol").notNull(),
    title: text("title").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("chat_sessions_symbol").on(t.symbol)],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    ts: text("ts").notNull(),
    role: text("role").notNull(),
    payload: text("payload", { mode: "json" }).$type<AgentMessage>().notNull(),
  },
  (t) => [index("chat_messages_session").on(t.sessionId)],
);
