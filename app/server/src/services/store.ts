import { promises as fs } from "node:fs";
import { join } from "node:path";
import { desc, eq, sql } from "drizzle-orm";
import { CURRENT_SCHEMA_VERSION, type ChartDoc, type ChartMeta } from "../../../shared/types.js";
import { getDb, type Db } from "../db/index.js";
import { chartMeta, outcomes } from "../db/schema.js";
import { CHART_DATA_DIR } from "../env.js";
import { publishAnalysisCreated } from "../realtime/analyses.js";
import { migrateLegacyDoc, type BuildResult } from "./build.js";

function toMeta(doc: ChartDoc): ChartMeta {
  return {
    id: doc.id,
    schema_version: doc.schema_version,
    type: doc.type,
    title: doc.title,
    symbol: doc.symbol,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    prediction_updated_at: doc.prediction_updated_at,
  };
}

function rowToMeta(row: typeof chartMeta.$inferSelect): ChartMeta {
  return {
    id: row.id,
    schema_version: row.schemaVersion,
    type: row.type as ChartMeta["type"],
    title: row.title,
    symbol: row.symbol,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    ...(row.predictionUpdatedAt != null ? { prediction_updated_at: row.predictionUpdatedAt } : {}),
  };
}

function metaToRow(meta: ChartMeta): typeof chartMeta.$inferInsert {
  return {
    id: meta.id,
    schemaVersion: meta.schema_version,
    type: meta.type,
    title: meta.title,
    symbol: meta.symbol,
    createdAt: meta.created_at,
    updatedAt: meta.updated_at,
    predictionUpdatedAt: meta.prediction_updated_at ?? null,
  };
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(CHART_DATA_DIR, { recursive: true });
}

function docPath(id: string): string {
  return join(CHART_DATA_DIR, `${id}.json`);
}

let scanned = false;

async function ensureIndex(db: Db): Promise<void> {
  if (scanned) return;
  scanned = true;
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(chartMeta);
  if (count > 0) return;
  await ensureDir();
  const files = (await fs.readdir(CHART_DATA_DIR)).filter((f) => f.endsWith(".json") && f !== "index.json");
  for (const f of files) {
    try {
      const doc = JSON.parse(await fs.readFile(join(CHART_DATA_DIR, f), "utf-8")) as ChartDoc;
      if (doc.id && doc.type) {
        await db.insert(chartMeta).values(metaToRow(toMeta(doc))).onConflictDoNothing();
      }
    } catch {
      continue;
    }
  }
}

export interface ListFilter {
  type?: string | string[];
  symbol?: string;
  limit?: number;
}

export async function listCharts(filter: ListFilter = {}, db: Db = getDb()): Promise<ChartMeta[]> {
  await ensureIndex(db);
  const rows = await db.select().from(chartMeta).orderBy(desc(chartMeta.createdAt));
  let metas = rows.map(rowToMeta);
  if (filter.type) {
    const types = Array.isArray(filter.type) ? filter.type : [filter.type];
    metas = metas.filter((m) => types.includes(m.type));
  }
  if (filter.symbol) {
    const s = filter.symbol.toUpperCase();
    metas = metas.filter((m) => (m.symbol ?? "").toUpperCase().includes(s));
  }
  if (filter.limit && filter.limit > 0) metas = metas.slice(0, filter.limit);
  return metas;
}

export async function loadChart(id: string): Promise<ChartDoc | null> {
  if (!/^[\p{L}\p{N}._-]+$/u.test(id)) return null;
  try {
    const doc = JSON.parse(await fs.readFile(docPath(id), "utf-8")) as ChartDoc;
    return migrateLegacyDoc(doc);
  } catch {
    return null;
  }
}

export async function allocateId(date: string, slug: string): Promise<string> {
  await ensureDir();
  const base = `${date}-${slug}`;
  let id = base;
  for (let n = 2; ; n++) {
    const existing = await loadChart(id);
    if (!existing) return id;
    const input = (existing.input ?? {}) as Record<string, unknown>;
    if (input.prediction == null && input.context == null) return id;
    id = `${base}-${n}`;
  }
}

export async function saveChart(doc: ChartDoc, db: Db = getDb()): Promise<void> {
  await ensureIndex(db);
  await ensureDir();
  await fs.writeFile(docPath(doc.id), JSON.stringify(doc));
  const row = metaToRow(toMeta(doc));
  await db.insert(chartMeta).values(row).onConflictDoUpdate({ target: chartMeta.id, set: row });
}

export async function createChart(result: BuildResult, db: Db = getDb()): Promise<ChartDoc> {
  const id = await allocateId(result.sessionDate, result.slug);
  const now = new Date().toISOString();
  const doc: ChartDoc = {
    id,
    schema_version: CURRENT_SCHEMA_VERSION,
    type: result.type,
    title: result.title,
    symbol: result.symbol,
    created_at: now,
    updated_at: now,
    input: result.input,
    built: result.built,
  };
  await saveChart(doc, db);
  if (doc.symbol) publishAnalysisCreated({ symbol: doc.symbol, chartId: doc.id });
  return doc;
}

export async function deleteChart(id: string, db: Db = getDb()): Promise<boolean> {
  const doc = await loadChart(id);
  const indexed = await db.select({ id: chartMeta.id }).from(chartMeta).where(eq(chartMeta.id, id)).limit(1);
  if (!doc && indexed.length === 0) return false;
  if (doc) await fs.rm(docPath(id));
  await db.delete(chartMeta).where(eq(chartMeta.id, id));
  await db.delete(outcomes).where(eq(outcomes.chartId, id));
  return true;
}
