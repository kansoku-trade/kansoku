import type { AgentMessagePayload } from "@kansoku/pro-api";
import type {
  ResearchEditOperation,
  ResearchEditStatus,
  ResearchKind,
  ResearchRefreshPhase,
  ResearchRefreshReport,
  ResearchRefreshStatus,
} from "../contract/research.js";
import type { Market } from "../services/symbol.utils.js";
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
    payload: text("payload", { mode: "json" }).$type<AgentMessagePayload>().notNull(),
  },
  (t) => [index("chat_messages_session").on(t.sessionId)],
);

export const researchChatSessions = sqliteTable(
  "research_chat_sessions",
  {
    id: text("id").primaryKey(),
    path: text("path").notNull().unique(),
    title: text("title").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("research_chat_sessions_updated").on(t.updatedAt)],
);

export const researchEditProposals = sqliteTable(
  "research_edit_proposals",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    path: text("path").notNull(),
    kind: text("kind").$type<ResearchKind>().notNull(),
    status: text("status").$type<ResearchEditStatus>().notNull(),
    summary: text("summary").notNull(),
    operations: text("operations", { mode: "json" }).$type<ResearchEditOperation[]>().notNull(),
    appliedOperationIndexes: text("applied_operation_indexes", { mode: "json" }).$type<number[]>(),
    beforeMarkdown: text("before_markdown").notNull(),
    afterMarkdown: text("after_markdown").notNull(),
    baseRevision: text("base_revision").notNull(),
    afterRevision: text("after_revision").notNull(),
    createdAt: text("created_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (t) => [
    index("research_edit_proposals_path").on(t.path, t.createdAt),
    index("research_edit_proposals_session").on(t.sessionId),
  ],
);

export const researchRefreshTasks = sqliteTable(
  "research_refresh_tasks",
  {
    id: text("id").primaryKey(),
    path: text("path").notNull(),
    objective: text("objective").notNull(),
    status: text("status").$type<ResearchRefreshStatus>().notNull(),
    phase: text("phase").$type<ResearchRefreshPhase>().notNull(),
    activity: text("activity").notNull(),
    baseRevision: text("base_revision").notNull(),
    report: text("report", { mode: "json" }).$type<ResearchRefreshReport>(),
    error: text("error"),
    startedAt: text("started_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    finishedAt: text("finished_at"),
  },
  (t) => [
    index("research_refresh_tasks_path").on(t.path, t.startedAt),
    index("research_refresh_tasks_status").on(t.status),
  ],
);

export const assistantSessions = sqliteTable(
  "assistant_sessions",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("assistant_sessions_updated").on(t.updatedAt)],
);

export const aiRoleSettings = sqliteTable("ai_role_settings", {
  role: text("role").primaryKey(),
  mode: text("mode").notNull(),
  provider: text("provider"),
  modelId: text("model_id"),
  thinkingLevel: text("thinking_level"),
  updatedAt: text("updated_at").notNull(),
});

export const providerCredentials = sqliteTable("provider_credentials", {
  provider: text("provider").primaryKey(),
  secret: text("secret").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const symbolFollows = sqliteTable("symbol_follows", {
  symbol: text("symbol").primaryKey(),
  startedAt: text("started_at").notNull(),
});

export const watchedMarketsSettings = sqliteTable("watched_markets_settings", {
  id: integer("id").primaryKey(),
  markets: text("markets", { mode: "json" }).$type<Market[]>().notNull(),
  updatedAt: text("updated_at").notNull(),
});
