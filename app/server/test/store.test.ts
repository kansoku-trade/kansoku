import { promises as fs } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { ChartDoc } from "../../shared/types.js";

const ctx = vi.hoisted(() => {
  const base = process.env.TMPDIR ?? "/tmp/";
  const sep = base.endsWith("/") ? "" : "/";
  const dir = `${base}${sep}store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { dir };
});

vi.mock("../src/env.js", () => ({ CHART_DATA_DIR: ctx.dir }));

const { listCharts, loadChart, saveChart, deleteChart } = await import("../src/services/store.js");

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
});
