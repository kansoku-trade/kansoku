import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listQuestions, loadQuestionFile } from "../../src/dataset/loader.js";
import { runBackfillNews } from "../../src/generate/backfillPipeline.js";
import type { EdgarFiling, GdeltArticle } from "../../src/generate/newsMapping.js";

function baseQuestion(symbol: string, id: string, cutoff: string) {
  return {
    id,
    bank: "swing",
    symbol,
    cutoff,
    layer: "high-vol-tech",
    adversarial: false,
    fixtures: {
      kline: { day: [], week: [] },
      indicators: {},
      quote: {},
      capitalFlow: {},
      news: [],
      fundamentals: {},
      calendar: {},
    },
    replay: { horizonBars: 20, bars: [] },
  };
}

describe("runBackfillNews", () => {
  let datasetsRoot: string;
  let resultsRoot: string;

  beforeEach(async () => {
    datasetsRoot = await mkdtemp(join(tmpdir(), "bench-backfill-datasets-"));
    resultsRoot = await mkdtemp(join(tmpdir(), "bench-backfill-results-"));
    const bankDir = join(datasetsRoot, "v1", "swing");
    await mkdir(bankDir, { recursive: true });
    await writeFile(
      join(bankDir, "swing-MU-2026-03-19-01.json"),
      JSON.stringify(baseQuestion("MU.US", "swing-MU-2026-03-19-01", "2026-03-19T20:00:00-04:00"), null, 2),
      "utf8",
    );
    await writeFile(
      join(bankDir, "swing-SPY-2026-03-19-01.json"),
      JSON.stringify(baseQuestion("SPY.US", "swing-SPY-2026-03-19-01", "2026-03-19T20:00:00-04:00"), null, 2),
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(datasetsRoot, { recursive: true, force: true });
    await rm(resultsRoot, { recursive: true, force: true });
  });

  function makeDeps(overrides: Partial<Parameters<typeof runBackfillNews>[0]> = {}) {
    let gdeltCalls = 0;
    let edgarCalls = 0;
    const gdeltArticle: GdeltArticle = {
      url: "https://example.com/story",
      title: "Micron rallies on earnings",
      seendate: "20260319T100000Z",
      domain: "example.com",
    };
    const edgarFiling: EdgarFiling = {
      form: "8-K",
      filingDate: "2026-03-10",
      primaryDocument: "mu-8k.htm",
      accessionNumber: "0000723125-26-000042",
    };
    return {
      counts: { gdeltCalls: () => gdeltCalls, edgarCalls: () => edgarCalls },
      options: {
        datasetsRoot,
        resultsRoot,
        version: "v1",
        bank: "swing",
        dryRun: false,
        fresh: false,
        fetchGdelt: async () => {
          gdeltCalls += 1;
          return [gdeltArticle];
        },
        fetchEdgar: async () => {
          edgarCalls += 1;
          return [edgarFiling];
        },
        log: () => {},
        listQuestionIds: listQuestions,
        ...overrides,
      },
    };
  }

  it("skips GDELT/EDGAR entirely for ETF questions (null companyQuery/cik)", async () => {
    const { options, counts } = makeDeps();
    const result = await runBackfillNews(options);
    const etf = result.processed.find((p) => p.symbol === "SPY.US");
    expect(etf).toEqual({ id: "swing-SPY-2026-03-19-01", symbol: "SPY.US", gdeltCount: 0, edgarCount: 0 });

    const rewritten = await loadQuestionFile(join(datasetsRoot, "v1", "swing", "swing-SPY-2026-03-19-01.json"));
    expect(rewritten.fixtures.news).toEqual([]);
    expect(counts.gdeltCalls()).toBe(1);
    expect(counts.edgarCalls()).toBe(1);
  });

  it("rewrites fixtures.news in place and round-trips through schema validation", async () => {
    const { options } = makeDeps();
    const result = await runBackfillNews(options);
    const mu = result.processed.find((p) => p.symbol === "MU.US");
    expect(mu?.gdeltCount).toBe(1);
    expect(mu?.edgarCount).toBe(1);

    const rewritten = await loadQuestionFile(join(datasetsRoot, "v1", "swing", "swing-MU-2026-03-19-01.json"));
    expect(rewritten.fixtures.news).toHaveLength(2);
    expect(rewritten.fixtures.news.every((item) => item.published_at <= rewritten.cutoff)).toBe(true);
  });

  it("does not write files in dry-run mode", async () => {
    const { options } = makeDeps({ dryRun: true });
    await runBackfillNews(options);
    const untouched = await loadQuestionFile(join(datasetsRoot, "v1", "swing", "swing-MU-2026-03-19-01.json"));
    expect(untouched.fixtures.news).toEqual([]);
  });

  it("hits cache on second run and does not call fetchers again unless --fresh", async () => {
    const sourceCacheRoot = await mkdtemp(join(tmpdir(), "bench-backfill-sources-"));
    try {
      const { options, counts } = makeDeps({ sourceCacheRoot });
      await runBackfillNews(options);
      const firstGdelt = counts.gdeltCalls();
      const firstEdgar = counts.edgarCalls();
      expect((await readdir(sourceCacheRoot)).length).toBeGreaterThan(0);
      await expect(access(join(datasetsRoot, ".cache"))).rejects.toThrow();

      await runBackfillNews(options);
      expect(counts.gdeltCalls()).toBe(firstGdelt);
      expect(counts.edgarCalls()).toBe(firstEdgar);

      await runBackfillNews({ ...options, fresh: true });
      expect(counts.gdeltCalls()).toBeGreaterThan(firstGdelt);
      expect(counts.edgarCalls()).toBeGreaterThan(firstEdgar);
    } finally {
      await rm(sourceCacheRoot, { recursive: true, force: true });
    }
  });

  it("filters by --symbols when provided", async () => {
    const { options } = makeDeps({ symbols: ["MU.US"] });
    const result = await runBackfillNews(options);
    expect(result.processed.map((p) => p.symbol)).toEqual(["MU.US"]);
  });

  it("trips the GDELT circuit breaker after consecutive failures and skips remaining GDELT calls", async () => {
    await writeFile(
      join(datasetsRoot, "v1", "swing", "swing-AMD-2026-03-19-01.json"),
      JSON.stringify(baseQuestion("AMD.US", "swing-AMD-2026-03-19-01", "2026-03-19T20:00:00-04:00"), null, 2),
      "utf8",
    );
    await writeFile(
      join(datasetsRoot, "v1", "swing", "swing-NVDA-2026-03-19-01.json"),
      JSON.stringify(baseQuestion("NVDA.US", "swing-NVDA-2026-03-19-01", "2026-03-19T20:00:00-04:00"), null, 2),
      "utf8",
    );
    let gdeltCalls = 0;
    const { options } = makeDeps({
      fetchGdelt: async () => {
        gdeltCalls += 1;
        throw new Error("simulated rate limit");
      },
    });
    const result = await runBackfillNews(options);
    expect(result.gdeltCircuitTripped).toBe(true);
    const nvda = result.processed.find((p) => p.symbol === "NVDA.US");
    expect(nvda?.gdeltSkipped).toBe(true);
    expect(gdeltCalls).toBe(2);
  });

  function archiveRow(date: string, domain: string, url: string, organizations: string): string {
    const cols = new Array(26).fill("");
    cols[1] = date;
    cols[3] = domain;
    cols[4] = url;
    cols[11] = organizations;
    return cols.join("\t");
  }

  it("news-source archive: fetches org matches from the injected archive fetcher without calling DOC", async () => {
    let gdeltCalls = 0;
    let readCsvCalls = 0;
    const { options } = makeDeps({
      newsSource: "archive",
      archiveThrottleMs: 0,
      fetchGdelt: async () => {
        gdeltCalls += 1;
        return [];
      },
      fetchArchiveFile: async () => Buffer.from("stub"),
      readArchiveCsv: async () => {
        readCsvCalls += 1;
        return archiveRow("20260319100000", "example.com", "https://example.com/micron-earnings-preview", "micron technology");
      },
    });
    const result = await runBackfillNews(options);
    const mu = result.processed.find((p) => p.symbol === "MU.US");
    expect(mu?.archiveCount).toBe(1);
    expect(gdeltCalls).toBe(0);
    expect(readCsvCalls).toBeGreaterThan(0);

    const rewritten = await loadQuestionFile(join(datasetsRoot, "v1", "swing", "swing-MU-2026-03-19-01.json"));
    expect(rewritten.fixtures.news.some((item) => item.source === "gdelt-arch:example.com")).toBe(true);
  });

  it("news-source auto: uses DOC while healthy, falls back to archive after the circuit breaker trips, and scans a shared window only once", async () => {
    await writeFile(
      join(datasetsRoot, "v1", "swing", "swing-AMD-2026-03-19-01.json"),
      JSON.stringify(baseQuestion("AMD.US", "swing-AMD-2026-03-19-01", "2026-03-19T20:00:00-04:00"), null, 2),
      "utf8",
    );
    await writeFile(
      join(datasetsRoot, "v1", "swing", "swing-NVDA-2026-03-19-01.json"),
      JSON.stringify(baseQuestion("NVDA.US", "swing-NVDA-2026-03-19-01", "2026-03-19T20:00:00-04:00"), null, 2),
      "utf8",
    );
    let gdeltCalls = 0;
    let readCsvCalls = 0;
    const { options } = makeDeps({
      newsSource: "auto",
      archiveThrottleMs: 0,
      fetchGdelt: async () => {
        gdeltCalls += 1;
        throw new Error("simulated rate limit");
      },
      fetchArchiveFile: async () => Buffer.from("stub"),
      readArchiveCsv: async () => {
        readCsvCalls += 1;
        return [
          archiveRow("20260319100000", "example.com", "https://example.com/micron-earnings-preview", "micron technology"),
          archiveRow("20260319100000", "example.com", "https://example.com/amd-rally-story", "advanced micro devices"),
          archiveRow("20260319100000", "example.com", "https://example.com/nvidia-launch-story", "nvidia corp"),
        ].join("\n");
      },
    });

    const result = await runBackfillNews(options);
    expect(result.gdeltCircuitTripped).toBe(true);
    expect(gdeltCalls).toBe(2);

    const nvda = result.processed.find((p) => p.symbol === "NVDA.US");
    expect(nvda?.archiveCount).toBe(1);

    const scanCallsForOneWindow = 192;
    expect(readCsvCalls).toBe(scanCallsForOneWindow);
  });

  it("warns when a results/ run already references the dataset version", async () => {
    const runDir = join(resultsRoot, "run-2026-01-01");
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "config.json"), JSON.stringify({ datasetVersion: "v1" }), "utf8");

    const logs: string[] = [];
    const { options } = makeDeps({ log: (line: string) => logs.push(line) });
    const result = await runBackfillNews(options);
    expect(result.frozenWarning).toContain("run-2026-01-01");
    expect(logs.some((line) => line.includes("WARNING"))).toBe(true);
  });
});
