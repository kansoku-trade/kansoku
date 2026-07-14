import { describe, expect, it } from "vitest";
import type { ChatRow } from "./useChatSession";
import { mergeTimeline, type TranscriptInsert } from "./transcriptTimeline.js";

const row = (id: string, ts: string): ChatRow => ({ id, ts, kind: "user", text: id });
const insert = (id: string, ts: string): TranscriptInsert => ({ id, ts, node: id });

const summarize = (entries: ReturnType<typeof mergeTimeline>) =>
  entries.map((entry) => (entry.kind === "row" ? entry.row.id : entry.insert.id));

describe("mergeTimeline", () => {
  it("interleaves rows and inserts by timestamp", () => {
    const rows = [row("r1", "2026-07-14T09:00:00Z"), row("r2", "2026-07-14T11:00:00Z")];
    const inserts = [insert("i1", "2026-07-14T10:00:00Z")];
    expect(summarize(mergeTimeline(rows, inserts))).toEqual(["r1", "i1", "r2"]);
  });

  it("places an insert before the first row with a later timestamp", () => {
    const rows = [row("r1", "2026-07-14T09:00:00Z"), row("r2", "2026-07-14T09:30:00Z"), row("r3", "2026-07-14T10:00:00Z")];
    const inserts = [insert("i1", "2026-07-14T09:15:00Z")];
    expect(summarize(mergeTimeline(rows, inserts))).toEqual(["r1", "i1", "r2", "r3"]);
  });

  it("orders a row before an insert with an equal timestamp", () => {
    const rows = [row("r1", "2026-07-14T09:00:00Z")];
    const inserts = [insert("i1", "2026-07-14T09:00:00Z")];
    expect(summarize(mergeTimeline(rows, inserts))).toEqual(["r1", "i1"]);
  });

  it("sorts entries with unparseable timestamps to the end", () => {
    const rows = [row("r1", "2026-07-14T09:00:00Z")];
    const inserts = [insert("i1", "not-a-date"), insert("i2", "2026-07-14T08:00:00Z")];
    expect(summarize(mergeTimeline(rows, inserts))).toEqual(["i2", "r1", "i1"]);
  });

  it("returns an empty timeline for empty rows and inserts", () => {
    expect(mergeTimeline([], [])).toEqual([]);
  });

  it("returns only rows when inserts is empty", () => {
    const rows = [row("r1", "2026-07-14T09:00:00Z"), row("r2", "2026-07-14T10:00:00Z")];
    expect(summarize(mergeTimeline(rows, []))).toEqual(["r1", "r2"]);
  });

  it("returns only inserts when rows is empty", () => {
    const inserts = [insert("i1", "2026-07-14T09:00:00Z"), insert("i2", "2026-07-14T08:00:00Z")];
    expect(summarize(mergeTimeline([], inserts))).toEqual(["i2", "i1"]);
  });

  it("keeps rows with non-monotonic timestamps in their original order", () => {
    const rows = [row("r1", "2026-07-14T11:00:00Z"), row("r2", "2026-07-14T09:00:00Z")];
    const inserts = [insert("i1", "2026-07-14T10:00:00Z")];
    expect(summarize(mergeTimeline(rows, inserts))).toEqual(["i1", "r1", "r2"]);
  });
});
