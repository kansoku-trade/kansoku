import { promises as fs } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ChartMeta, CockpitComment } from "../../shared/types.js";
import { buildRecapMarkdown, runDailyRecap, type RecapDeps, type RecapSymbolReport } from "../src/ai/recap.js";
import { summarizeUsage } from "../src/ai/usageStore.js";

const dir = join(process.env.TMPDIR ?? "/tmp", `recap-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function report(overrides: Partial<RecapSymbolReport> = {}): RecapSymbolReport {
  return {
    symbol: "MU.US",
    direction: "long",
    entry: 100,
    stop: 96,
    target1: 106,
    outcome: { status: "hit_target", pct_since_anchor: 4.2, resolved_at: 1 },
    comments: [],
    ...overrides,
  };
}

function comment(overrides: Partial<CockpitComment> = {}): CockpitComment {
  return {
    ts: "2026-07-02T15:32:00.000Z",
    symbol: "MU.US",
    level: "info",
    text: "观察一条",
    source: "commentator",
    ...overrides,
  };
}

describe("buildRecapMarkdown", () => {
  it("renders direction, outcome, comment tallies and alerts", () => {
    const md = buildRecapMarkdown(
      "2026-07-02",
      [
        report({
          comments: [
            comment(),
            comment({ level: "alert", text: "跌破止损", trigger: "level_break: below stop" }),
            comment({ level: "warn", text: "量能异常", trigger: "volume_spike: 4x" }),
          ],
        }),
      ],
      summarizeUsage("2026-07-02", []),
    );
    expect(md).toContain("# 2026-07-02 盘中自动小结");
    expect(md).toContain("## MU.US");
    expect(md).toContain("预测方向：做多（入场 100 / 止损 96 / 目标 106）");
    expect(md).toContain("结局：盘中打到目标，锚点以来 +4.20%");
    expect(md).toContain("点评共 3 条：警报 1 · 提醒 1 · 观察 1");
    expect(md).toContain("触发分布：level_break ×1 · volume_spike ×1");
    expect(md).toContain("【警报】跌破止损");
  });

  it("handles a day without symbols", () => {
    const md = buildRecapMarkdown("2026-07-02", [], null);
    expect(md).toContain("当日没有跟踪中的 intraday 标的");
    expect(md).toContain("当日没有记录到 AI 花费");
  });

  it("marks unresolved and unjudged outcomes", () => {
    const open = buildRecapMarkdown(
      "2026-07-02",
      [report({ outcome: { status: "open", pct_since_anchor: -0.5, resolved_at: null } })],
      null,
    );
    expect(open).toContain("收盘未了结，锚点以来 -0.50%");
    const unjudged = buildRecapMarkdown("2026-07-02", [report({ outcome: null })], null);
    expect(unjudged).toContain("结局：无法判定");
  });
});

describe("runDailyRecap", () => {
  function deps(overrides: Partial<RecapDeps> = {}): RecapDeps {
    const meta: ChartMeta = {
      id: "2026-07-02-mu-intraday",
      schema_version: 2,
      type: "intraday",
      title: "MU.US 短线多周期",
      symbol: "MU.US",
      created_at: "2026-07-02T14:00:00.000Z",
      updated_at: "2026-07-02T14:00:00.000Z",
    };
    return {
      journalDir: dir,
      listCharts: async () => [meta],
      loadChart: async () => null,
      fetchKline: async () => [],
      listComments: async () => [comment()],
      listUsage: async () => [],
      getOutcome: async () => null,
      saveOutcome: async () => {},
      ...overrides,
    };
  }

  it("writes the recap once and skips on rerun", async () => {
    const first = await runDailyRecap("2026-07-02", deps());
    expect(first.written).toBe(true);
    const content = await fs.readFile(first.path, "utf-8");
    expect(content).toContain("## MU.US");
    expect(content).toContain("当日没有落盘的预测");

    const second = await runDailyRecap("2026-07-02", deps());
    expect(second.written).toBe(false);
  });

  it("ignores charts from other dates", async () => {
    const result = await runDailyRecap("2026-07-03", deps());
    expect(result.written).toBe(true);
    const content = await fs.readFile(result.path, "utf-8");
    expect(content).toContain("当日没有跟踪中的 intraday 标的");
  });
});
