import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { CHART_DATA_DIR, PROJECT_ROOT } from '../platform/env.js';
import * as schema from './schema.js';

// PROJECT_ROOT already honors TRADE_PROJECT_ROOT (see env.ts) for the same
// bundling-relocation reason. A packaged desktop app points TRADE_PROJECT_ROOT
// at userData (not a repo checkout, no packages/core/drizzle folder there), so
// it sets TRADE_MIGRATIONS_DIR explicitly at the extraResources copy instead.
// Resolved lazily: the desktop bundle merges this module into main.mjs, where
// a top-level const would evaluate before main.ts assigns TRADE_PROJECT_ROOT /
// TRADE_MIGRATIONS_DIR and capture a wrong fallback path.
function resolveMigrationsDir(): string {
  return (
    process.env.TRADE_MIGRATIONS_DIR ??
    (process.env.TRADE_PROJECT_ROOT
      ? join(PROJECT_ROOT, 'packages', 'core', 'drizzle')
      : join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle'))
  );
}

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function createDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const client = new Database(path);
  client.pragma('journal_mode = WAL');
  const db = drizzle({ client, schema });
  migrate(db, { migrationsFolder: resolveMigrationsDir() });
  return db;
}

let singleton: Db | null = null;

export function getDb(): Db {
  if (!singleton) singleton = createDb(join(CHART_DATA_DIR, 'app.db'));
  return singleton;
}
