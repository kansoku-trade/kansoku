import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import { CHART_DATA_DIR, PROJECT_ROOT } from '../platform/env.js';

// PROJECT_ROOT already honors TRADE_PROJECT_ROOT (see env.ts) for the same
// bundling-relocation reason. A packaged desktop app points TRADE_PROJECT_ROOT
// at its Agent Workspace (not a repo checkout, no packages/core/drizzle folder there), so
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

export type Db = ReturnType<typeof drizzle>;

export function createDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const client = new DatabaseSync(path);
  client.exec('PRAGMA journal_mode = WAL');
  const db = drizzle({ client });
  migrate(db, { migrationsFolder: resolveMigrationsDir() });
  return db;
}

let singleton: Db | null = null;

export function getDb(): Db {
  if (!singleton) {
    singleton = createDb(process.env.KANSOKU_DB_PATH ?? join(CHART_DATA_DIR, 'app.db'));
  }
  return singleton;
}
