import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runGenerate } from "../../src/generate/pipeline.js";
import type { QuoteBar } from "../../src/generate/assemble.js";
import { loadQuestionForScorer } from "../../src/dataset/loader.js";

function isWeekday(date: Date): boolean {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

function buildDayBars(startIso: string, endIso: string): QuoteBar[] {
  const bars: QuoteBar[] = [];
  const cur = new Date(Date.parse(`${startIso}T00:00:00Z`));
  const end = Date.parse(`${endIso}T00:00:00Z`);
  let i = 0;
  while (cur.getTime() <= end) {
    if (isWeekday(cur)) {
      const iso = cur.toISOString().slice(0, 10);
      const close = 100 + Math.sin(i / 9) * 4 + i * 0.02;
      bars.push({
        time: `${iso}T05:00:00Z`,
        open: `${close - 0.3}`,
        high: `${close + 1}`,
        low: `${close - 1}`,
        close: `${close}`,
        volume: `${1_000_000 + i}`,
        turnover: `${(1_000_000 + i) * close}`,
      });
      i += 1;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return bars;
}

function buildWeekBars(startIso: string, endIso: string): QuoteBar[] {
  const bars: QuoteBar[] = [];
  const cur = new Date(Date.parse(`${startIso}T00:00:00Z`));
  const end = Date.parse(`${endIso}T00:00:00Z`);
  let i = 0;
  while (cur.getTime() <= end) {
    const iso = cur.toISOString().slice(0, 10);
    const close = 100 + Math.sin(i / 6) * 4 + i * 0.1;
    bars.push({
      time: `${iso}T05:00:00Z`,
      open: `${close - 0.5}`,
      high: `${close + 1.5}`,
      low: `${close - 1.5}`,
      close: `${close}`,
      volume: `${5_000_000 + i}`,
    });
    cur.setUTCDate(cur.getUTCDate() + 7);
    i += 1;
  }
  return bars;
}

const DAY_BARS = buildDayBars("2024-01-01", "2026-07-01");
const WEEK_BARS = buildWeekBars("2020-01-06", "2026-06-29");

function makeOptions(overrides: Partial<Parameters<typeof runGenerate>[0]> = {}) {
  const log: string[] = [];
  let klineCalls = 0;
  return {
    log,
    klineCalls: () => klineCalls,
    options: {
      bank: "swing" as const,
      symbols: [{ symbol: "MU.US", layer: "high-vol-tech" as const }],
      version: "v1",
      windowsPerSymbol: 2,
      dryRun: false,
      fresh: false,
      datasetsRoot: "",
      fetchKlineHistory: async (_symbol: string, period: "day" | "week") => {
        klineCalls += 1;
        return period === "day" ? DAY_BARS : WEEK_BARS;
      },
      fetchCalendar: async () => [],
      now: () => new Date("2026-07-01T00:00:00Z"),
      log: (line: string) => log.push(line),
      ...overrides,
    },
  };
}

describe("runGenerate", () => {
  let datasetsRoot: string;

  beforeEach(async () => {
    datasetsRoot = await mkdtemp(join(tmpdir(), "bench-generate-"));
  });

  afterEach(async () => {
    await rm(datasetsRoot, { recursive: true, force: true });
  });

  it("plans windows and writes nothing in dry-run mode", async () => {
    const { options, log } = makeOptions({ datasetsRoot, dryRun: true });
    const result = await runGenerate(options);
    expect(result.written).toEqual([]);
    expect(log.some((line) => line.includes("plan swing-MU-"))).toBe(true);
  });

  it("writes validated question files in real generation mode", async () => {
    const { options } = makeOptions({ datasetsRoot });
    const result = await runGenerate(options);
    expect(result.written.length).toBe(2);
    expect(result.skipped).toEqual([]);
    for (const file of result.written) {
      const question = await loadQuestionForScorer(datasetsRoot, "v1", "swing", file.id);
      expect(question.symbol).toBe("MU.US");
      expect(question.fixtures.kline.day).toHaveLength(250);
      expect(question.replay.bars).toHaveLength(20);
    }
  });

  it("caches raw kline pulls across runs unless --fresh is passed", async () => {
    const sourceCacheRoot = await mkdtemp(join(tmpdir(), "bench-generate-sources-"));
    try {
      const { options, klineCalls } = makeOptions({ datasetsRoot, sourceCacheRoot });
      await runGenerate(options);
      const firstCalls = klineCalls();
      expect(firstCalls).toBe(2);
      expect((await readdir(sourceCacheRoot)).sort()).toEqual(["MU.US-day.json", "MU.US-week.json"]);
      await expect(access(join(datasetsRoot, ".cache"))).rejects.toThrow();

      await runGenerate(options);
      expect(klineCalls()).toBe(firstCalls);

      await runGenerate({ ...options, fresh: true });
      expect(klineCalls()).toBe(firstCalls * 2);
    } finally {
      await rm(sourceCacheRoot, { recursive: true, force: true });
    }
  });

  it("logs a skip reason and writes nothing when every candidate window is halted", async () => {
    const haltedDay = DAY_BARS.map((bar) => (bar.time.slice(0, 10) >= "2026-01-01" ? { ...bar, volume: "0" } : bar));
    const { options } = makeOptions({
      datasetsRoot,
      fetchKlineHistory: async (_symbol: string, period: "day" | "week") =>
        period === "day" ? haltedDay : WEEK_BARS,
    });
    const result = await runGenerate(options);
    expect(result.written).toEqual([]);
    expect(result.skipped.length).toBeGreaterThan(0);
    for (const skip of result.skipped) {
      expect(skip.reasons).toContain("zero_volume_halt");
    }
  });
});
