import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { CHART_DATA_DIR } from "../env.js";
import * as schema from "./schema.js";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "drizzle");

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const client = new Database(path);
  client.pragma("journal_mode = WAL");
  const db = drizzle({ client, schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

let singleton: Db | null = null;

export function getDb(): Db {
  if (!singleton) singleton = createDb(join(CHART_DATA_DIR, "app.db"));
  return singleton;
}
