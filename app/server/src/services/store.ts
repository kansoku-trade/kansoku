import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { ChartDoc, ChartMeta } from "../../../shared/types.js";
import { CHART_DATA_DIR } from "../env.js";
import { migrateLegacyDoc } from "./build.js";

const INDEX_FILE = join(CHART_DATA_DIR, "index.json");

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

async function ensureDir(): Promise<void> {
  await fs.mkdir(CHART_DATA_DIR, { recursive: true });
}

function docPath(id: string): string {
  return join(CHART_DATA_DIR, `${id}.json`);
}

async function rebuildIndex(): Promise<ChartMeta[]> {
  await ensureDir();
  const files = (await fs.readdir(CHART_DATA_DIR)).filter((f) => f.endsWith(".json") && f !== "index.json");
  const metas: ChartMeta[] = [];
  for (const f of files) {
    try {
      const doc = JSON.parse(await fs.readFile(join(CHART_DATA_DIR, f), "utf-8")) as ChartDoc;
      if (doc.id && doc.type) metas.push(toMeta(doc));
    } catch {
      continue;
    }
  }
  metas.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  await fs.writeFile(INDEX_FILE, JSON.stringify(metas, null, 1));
  return metas;
}

async function readIndex(): Promise<ChartMeta[]> {
  try {
    return JSON.parse(await fs.readFile(INDEX_FILE, "utf-8")) as ChartMeta[];
  } catch {
    return rebuildIndex();
  }
}

export interface ListFilter {
  type?: string;
  symbol?: string;
  limit?: number;
}

export async function listCharts(filter: ListFilter = {}): Promise<ChartMeta[]> {
  let metas = await readIndex();
  if (filter.type) metas = metas.filter((m) => m.type === filter.type);
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
    try {
      await fs.access(docPath(id));
      id = `${base}-${n}`;
    } catch {
      return id;
    }
  }
}

export async function saveChart(doc: ChartDoc): Promise<void> {
  await ensureDir();
  await fs.writeFile(docPath(doc.id), JSON.stringify(doc));
  const metas = (await readIndex()).filter((m) => m.id !== doc.id);
  metas.unshift(toMeta(doc));
  metas.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  await fs.writeFile(INDEX_FILE, JSON.stringify(metas, null, 1));
}

export async function deleteChart(id: string): Promise<boolean> {
  const doc = await loadChart(id);
  if (!doc) return false;
  await fs.rm(docPath(id));
  const metas = (await readIndex()).filter((m) => m.id !== id);
  await fs.writeFile(INDEX_FILE, JSON.stringify(metas, null, 1));
  return true;
}
