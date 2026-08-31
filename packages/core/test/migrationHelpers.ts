import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const DRIZZLE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');

export interface MigrationFixture {
  createdAt: number;
  hash: string;
  name: string;
  sql: string;
  tag: string;
}

export function migrationFixtures(): MigrationFixture[] {
  return readdirSync(DRIZZLE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{14}_/.test(entry.name))
    .map((entry) => {
      const stamp = entry.name.slice(0, 14);
      const sql = readFileSync(join(DRIZZLE_DIR, entry.name, 'migration.sql'), 'utf8');
      return {
        createdAt: Date.UTC(
          Number(stamp.slice(0, 4)),
          Number(stamp.slice(4, 6)) - 1,
          Number(stamp.slice(6, 8)),
          Number(stamp.slice(8, 10)),
          Number(stamp.slice(10, 12)),
          Number(stamp.slice(12, 14)),
        ),
        hash: createHash('sha256').update(sql).digest('hex'),
        name: entry.name,
        sql,
        tag: entry.name.slice(15),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function executeMigration(db: DatabaseSync, migration: MigrationFixture): void {
  db.exec(migration.sql.replaceAll('--> statement-breakpoint', ''));
}

export function seedLegacyLedger(
  db: DatabaseSync,
  throughTag: string,
  overrides: {
    createdAt?: Record<string, number>;
    hash?: Record<string, string>;
  } = {},
): MigrationFixture[] {
  const migrations = migrationFixtures();
  const target = migrations.findIndex((migration) => migration.tag === throughTag);
  if (target === -1) throw new Error(`migration ${throughTag} missing`);

  db.exec(`
    CREATE TABLE __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    );
  `);
  const insert = db.prepare(
    'INSERT INTO __drizzle_migrations (id, hash, created_at) VALUES (?, ?, ?)',
  );
  for (const [index, migration] of migrations.slice(0, target + 1).entries()) {
    insert.run(
      index + 1,
      overrides.hash?.[migration.tag] ?? migration.hash,
      overrides.createdAt?.[migration.tag] ?? migration.createdAt,
    );
  }
  return migrations.slice(0, target + 1);
}
