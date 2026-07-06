import { promises as fs } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { BuildResult } from "../src/services/build.js";
import type { ChartDoc } from "../../shared/types.js";

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? "/tmp/";
  const sep = base.endsWith("/") ? "" : "/";
  const dir = `${base}${sep}store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { dir };
});

vi.mock("../src/env.js", () => ({ CHART_DATA_DIR: ctx.dir }));

const { allocateId, listCharts, loadChart, saveChart, createChart, deleteChart } = await import(
  "../src/services/store.js"
);
const { subscribeAnalyses } = await import("../src/realtime/analyses.js");

function buildResult(overrides: Partial<BuildResult> = {}): BuildResult {
  return {
    type: "intraday",
    title: "MU 短线多周期",
    slug: "mu-intraday",
    symbol: "MU.US",
    sessionDate: "2026-08-10",
    input: {},
    built: { kind: "intraday" } as unknown as ChartDoc["built"],
    meta: {},
    ...overrides,
  };
}

function doc(id: string, overrides: Partial<ChartDoc> = {}): ChartDoc {
  return {
    id,
    schema_version: 2,
    type: "intraday",
    title: `${id} title`,
    symbol: "MU.US",
    created_at: "2026-07-02T14:00:00.000Z",
    updated_at: "2026-07-02T14:00:00.000Z",
    input: {},
    built: { kind: "intraday" } as unknown as ChartDoc["built"],
    ...overrides,
  };
}

afterAll(async () => {
  await fs.rm(ctx.dir, { recursive: true, force: true });
});

describe("chart store", () => {
  it("imports pre-existing doc files into the index on first use", async () => {
    await fs.mkdir(ctx.dir, { recursive: true });
    await fs.writeFile(join(ctx.dir, "2026-07-01-legacy.json"), JSON.stringify(doc("2026-07-01-legacy")));
    const metas = await listCharts();
    expect(metas.map((m) => m.id)).toContain("2026-07-01-legacy");
  });

  it("saves a doc to file and index, newest first", async () => {
    await saveChart(doc("2026-07-02-a", { created_at: "2026-07-02T15:00:00.000Z" }));
    await saveChart(doc("2026-07-02-b", { created_at: "2026-07-02T16:00:00.000Z", type: "sepa" }));
    const metas = await listCharts();
    expect(metas[0].id).toBe("2026-07-02-b");
    const loaded = await loadChart("2026-07-02-a");
    expect(loaded?.title).toBe("2026-07-02-a title");
  });

  it("filters by type, symbol substring, and limit", async () => {
    expect((await listCharts({ type: "sepa" })).map((m) => m.id)).toEqual(["2026-07-02-b"]);
    expect((await listCharts({ symbol: "mu" })).length).toBeGreaterThanOrEqual(2);
    expect(await listCharts({ limit: 1 })).toHaveLength(1);
  });

  it("filters by an array of types (OR semantics)", async () => {
    const ids = (await listCharts({ type: ["sepa", "intraday"] })).map((m) => m.id);
    expect(ids).toContain("2026-07-02-b");
    expect(ids).toContain("2026-07-02-a");
  });

  it("upserts on re-save instead of duplicating", async () => {
    await saveChart(doc("2026-07-02-a", { title: "updated", created_at: "2026-07-02T15:00:00.000Z" }));
    const metas = (await listCharts()).filter((m) => m.id === "2026-07-02-a");
    expect(metas).toHaveLength(1);
    expect(metas[0].title).toBe("updated");
  });

  it("deletes the doc file and the index row", async () => {
    expect(await deleteChart("2026-07-02-a")).toBe(true);
    expect(await loadChart("2026-07-02-a")).toBeNull();
    expect((await listCharts()).map((m) => m.id)).not.toContain("2026-07-02-a");
    expect(await deleteChart("2026-07-02-a")).toBe(false);
  });

  describe("allocateId", () => {
    it("returns base id when nothing exists", async () => {
      expect(await allocateId("2026-08-01", "mu-intraday")).toBe("2026-08-01-mu-intraday");
    });

    it("reuses base id when existing doc is a preview shell (no prediction/context)", async () => {
      await saveChart(doc("2026-08-02-mu-intraday", { input: {} }));
      expect(await allocateId("2026-08-02", "mu-intraday")).toBe("2026-08-02-mu-intraday");
    });

    it("suffixes when existing doc has a user prediction", async () => {
      await saveChart(doc("2026-08-03-mu-intraday", { input: { prediction: { direction: "long" } } as ChartDoc["input"] }));
      expect(await allocateId("2026-08-03", "mu-intraday")).toBe("2026-08-03-mu-intraday-2");
    });

    it("suffixes when existing doc has only context (no prediction)", async () => {
      await saveChart(
        doc("2026-08-04-mu-intraday", { input: { context: { conclusion: { stance: "neutral" } } } as ChartDoc["input"] }),
      );
      expect(await allocateId("2026-08-04", "mu-intraday")).toBe("2026-08-04-mu-intraday-2");
    });

    it("skips preview shells in the -N chain and returns the first non-existing slot", async () => {
      await saveChart(doc("2026-08-05-mu-intraday", { input: { prediction: { direction: "short" } } as ChartDoc["input"] }));
      await saveChart(doc("2026-08-05-mu-intraday-2", { input: {} }));
      expect(await allocateId("2026-08-05", "mu-intraday")).toBe("2026-08-05-mu-intraday-2");
    });
  });

  describe("deleteChart", () => {
    it("purges an orphan index row when the doc file is missing", async () => {
      await saveChart(doc("2026-08-06-orphan"));
      await fs.rm(join(ctx.dir, "2026-08-06-orphan.json"));
      expect(await deleteChart("2026-08-06-orphan")).toBe(true);
      expect((await listCharts()).map((m) => m.id)).not.toContain("2026-08-06-orphan");
      expect(await deleteChart("2026-08-06-orphan")).toBe(false);
    });
  });

  describe("createChart", () => {
    it("allocates an id, persists the doc, and publishes analysis-created when symbol is set", async () => {
      const received: unknown[] = [];
      const unsub = subscribeAnalyses("MU.US", (envelope) => received.push(JSON.parse(envelope)));
      const created = await createChart(buildResult({ sessionDate: "2026-08-10", slug: "mu-intraday" }));
      unsub();

      expect(created.id).toBe("2026-08-10-mu-intraday");
      expect(created.schema_version).toBe(2);
      expect(created.created_at).toBe(created.updated_at);
      expect(await loadChart(created.id)).toMatchObject({ id: created.id, symbol: "MU.US" });
      expect(received).toEqual([{ type: "analysis-created", symbol: "MU.US", chartId: created.id }]);
    });

    it("does not publish for symbol-less charts", async () => {
      const received: unknown[] = [];
      const unsub = subscribeAnalyses("MU.US", (envelope) => received.push(JSON.parse(envelope)));
      await createChart(buildResult({ symbol: null, sessionDate: "2026-08-11", slug: "flow", type: "flow" }));
      unsub();
      expect(received).toEqual([]);
    });
  });
});
