import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import type { CockpitComment } from '@kansoku/shared/types';
import { appendComment, listComments } from '../src/ai/personas/comments.js';
import { createDb } from '../src/db/index.js';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const COMMENTS_BASE_SCHEMA = `
  CREATE TABLE comments (
    id text PRIMARY KEY NOT NULL,
    ts text NOT NULL,
    eastern_date text NOT NULL,
    symbol text NOT NULL,
    level text NOT NULL,
    text text NOT NULL,
    trigger text,
    source text NOT NULL,
    escalated integer,
    chart_id text
  );
  CREATE INDEX comments_symbol_date ON comments (symbol, eastern_date);
`;

const MIGRATIONS_SCHEMA = `
  CREATE TABLE __drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at numeric
  );
`;

function insertLegacyComment(client: Database.Database): void {
  client
    .prepare(
      `INSERT INTO comments
        (id, ts, eastern_date, symbol, level, text, source)
       VALUES
        ('1', '2026-07-23T15:00:00.000Z', '2026-07-23', 'MU.US', 'info', '旧点评', 'commentator')`,
    )
    .run();
}

function seedLocalWatchlistCollision(path: string): void {
  const client = new Database(path);
  client.exec(`
    ${COMMENTS_BASE_SCHEMA}
    CREATE TABLE local_watchlist_settings (
      id integer PRIMARY KEY NOT NULL,
      symbols text NOT NULL,
      updated_at text NOT NULL
    );
    ${MIGRATIONS_SCHEMA}
    INSERT INTO __drizzle_migrations (hash, created_at)
    VALUES ('4fc54e357d28fb12d31cd744ad3cd7b73703f8a047463afc947b1c1aa6be9544', 1784037000000);
  `);
  insertLegacyComment(client);
  client.close();
}

function seedHealthyJudgmentMigration(path: string): void {
  const client = new Database(path);
  client.exec(`
    ${COMMENTS_BASE_SCHEMA}
    ALTER TABLE comments ADD read text;
    ALTER TABLE comments ADD stance text;
    ALTER TABLE comments ADD stance_note text;
    ${MIGRATIONS_SCHEMA}
    INSERT INTO __drizzle_migrations (hash, created_at)
    VALUES ('c1ea4988b8c5ff468abeab31adf2b7c2bc4e8f624aa139cbbad0f27c96433cac', 1784037000000);
    INSERT INTO comments
      (id, ts, eastern_date, symbol, level, text, source, read, stance, stance_note)
    VALUES
      ('1', '2026-07-23T15:00:00.000Z', '2026-07-23', 'MU.US', 'warn', '结构破位',
       'commentator', '放量确认', 'act_per_plan', '按计划控制风险');
  `);
  client.close();
}

function databasePath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'kansoku-db-compat-'));
  dirs.push(dir);
  return path.join(dir, 'app.db');
}

function structuredComment(): CockpitComment {
  return {
    ts: '2026-07-23T15:05:00.000Z',
    symbol: 'MU.US',
    level: 'warn',
    text: '价格跌破盘中支撑。',
    read: '放量确认，不是瞬间插针。',
    stance: 'act_per_plan',
    stanceNote: '按计划控制风险。',
    source: 'commentator',
  };
}

describe('database migration compatibility', () => {
  it('repairs the released 0008 collision and preserves legacy comments', async () => {
    const dbPath = databasePath();
    seedLocalWatchlistCollision(dbPath);

    const db = createDb(dbPath);
    try {
      await appendComment(structuredComment(), db);
      const rows = await listComments('MU.US', '2026-07-23', db);

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ text: '旧点评' });
      expect(rows[1]).toEqual(structuredComment());
    } finally {
      db.$client.close();
    }
  });

  it('preserves structured judgment data from a healthy 0008 database', async () => {
    const dbPath = databasePath();
    seedHealthyJudgmentMigration(dbPath);

    const db = createDb(dbPath);
    try {
      await expect(listComments('MU.US', '2026-07-23', db)).resolves.toEqual([
        {
          ts: '2026-07-23T15:00:00.000Z',
          symbol: 'MU.US',
          level: 'warn',
          text: '结构破位',
          source: 'commentator',
          read: '放量确认',
          stance: 'act_per_plan',
          stanceNote: '按计划控制风险',
        },
      ]);
    } finally {
      db.$client.close();
    }
  });
});
