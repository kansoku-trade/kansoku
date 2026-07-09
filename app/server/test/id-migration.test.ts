import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";
import { createDb } from "../src/db/index.js";
import { chatMessages, chatSessions } from "../src/db/schema.js";
import { snowflakeToDate } from "../src/db/snowflake.js";

const DRIZZLE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

interface JournalEntry {
  tag: string;
}

function journalEntries(): JournalEntry[] {
  return JSON.parse(readFileSync(join(DRIZZLE_DIR, "meta", "_journal.json"), "utf-8")).entries;
}

function execMigration(db: Database.Database, tag: string): void {
  const sql = readFileSync(join(DRIZZLE_DIR, `${tag}.sql`), "utf-8").replaceAll("--> statement-breakpoint", "");
  db.exec(sql);
}

function seedPriorSchema(): { db: Database.Database; migrationTag: string } {
  const entries = journalEntries();
  const db = new Database(":memory:");
  for (const entry of entries.slice(0, -1)) execMigration(db, entry.tag);
  return { db, migrationTag: entries[entries.length - 1].tag };
}

function eachSecond(id: string, ts: string): void {
  expect(Math.floor(snowflakeToDate(id).getTime() / 1000)).toBe(Math.floor(new Date(ts).getTime() / 1000));
}

describe("comments/ai_usage snowflake id migration", () => {
  it("preserves row counts, mints unique TEXT snowflake ids, and keeps (ts, id) order", () => {
    const { db, migrationTag } = seedPriorSchema();

    const rows = [
      { label: "A", id: 1, ts: "2026-07-02T15:00:00.000Z" },
      { label: "B", id: 2, ts: "2026-07-02T15:00:00.500Z" },
      { label: "C", id: 3, ts: "2026-07-02T14:59:59.000Z" },
      { label: "D", id: 4, ts: "2026-07-02T15:00:01.000Z" },
    ];
    const insertComment = db.prepare(
      "INSERT INTO comments (id, ts, eastern_date, symbol, level, text, source) VALUES (?, ?, '2026-07-02', 'MU.US', 'info', ?, 'commentator')",
    );
    const insertUsage = db.prepare(
      `INSERT INTO ai_usage
         (id, ts, eastern_date, layer, symbol, model, calls, total_tokens, input, output, cache_read, cache_write, cost_total)
       VALUES (?, ?, '2026-07-02', 'commentator', 'MU.US', 'anthropic/haiku', 1, 100, 80, 20, 0, 0, 0.01)`,
    );
    for (const row of rows) {
      insertComment.run(row.id, row.ts, row.label);
      insertUsage.run(row.id, row.ts);
    }

    execMigration(db, migrationTag);

    const expectedOrder = ["C", "A", "B", "D"];

    const commentRows = db.prepare("SELECT id, text, ts FROM comments ORDER BY ts, id").all() as {
      id: string;
      text: string;
      ts: string;
    }[];
    expect(commentRows).toHaveLength(rows.length);
    expect(commentRows.map((r) => r.text)).toEqual(expectedOrder);
    for (const row of commentRows) {
      expect(typeof row.id).toBe("string");
      expect(() => BigInt(row.id)).not.toThrow();
      eachSecond(row.id, row.ts);
    }
    expect(new Set(commentRows.map((r) => r.id)).size).toBe(commentRows.length);

    const usageRows = db.prepare("SELECT id, ts FROM ai_usage ORDER BY ts, id").all() as { id: string; ts: string }[];
    expect(usageRows).toHaveLength(rows.length);
    for (const row of usageRows) {
      expect(typeof row.id).toBe("string");
      expect(() => BigInt(row.id)).not.toThrow();
      eachSecond(row.id, row.ts);
    }
    expect(new Set(usageRows.map((r) => r.id)).size).toBe(usageRows.length);
  });

  it("fails loudly instead of silently colliding when two old ids share a second modulo 4096", () => {
    const { db, migrationTag } = seedPriorSchema();
    const insertComment = db.prepare(
      "INSERT INTO comments (id, ts, eastern_date, symbol, level, text, source) VALUES (?, ?, '2026-07-02', 'MU.US', 'info', 'x', 'commentator')",
    );
    insertComment.run(1, "2026-07-02T15:00:00.000Z");
    insertComment.run(4097, "2026-07-02T15:00:00.900Z");

    expect(() => execMigration(db, migrationTag)).toThrow(/UNIQUE constraint failed/);
  });
});

describe("chat_sessions / chat_messages", () => {
  it("round-trips an insert/select through drizzle", async () => {
    const db = createDb(":memory:");

    await db.insert(chatSessions).values({
      id: "1001",
      chartId: "mu-2026-07-02-intraday",
      symbol: "MU.US",
      title: "MU 短线",
      createdAt: "2026-07-02T15:00:00.000Z",
      updatedAt: "2026-07-02T15:00:00.000Z",
    });
    const sessions = await db.select().from(chatSessions);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].chartId).toBe("mu-2026-07-02-intraday");

    const payload: AgentMessage = { role: "user", content: "怎么看这个走势", timestamp: 1751472000000 };
    await db.insert(chatMessages).values({
      id: "1002",
      sessionId: "1001",
      ts: "2026-07-02T15:00:00.000Z",
      role: "user",
      payload,
    });
    const messages = await db.select().from(chatMessages);
    expect(messages).toHaveLength(1);
    expect(messages[0].payload).toEqual(payload);
  });
});
