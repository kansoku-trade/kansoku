import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import { renderReport } from "../../src/report/render.js";
import { aggregate } from "../../src/score/aggregate.js";
import { reportSummarySchema } from "../../src/schema/reportSummary.js";
import { RUN_CONFIG_DEFAULTS } from "../../src/schema/runConfig.js";
import type { Scores } from "../../src/schema/scores.js";
import { mkCell } from "../score/helpers.js";

const WEIGHTS = RUN_CONFIG_DEFAULTS.weights;
const FIXED_NOW = () => new Date("2026-07-17T12:00:00Z");

function buildScores(): Scores {
  const cells = [
    mkCell({
      model: "openai/gpt-5",
      questionId: "swing-MU-01",
      mode: "blind",
      rep: 0,
      layer: "high-vol-tech",
      regime: "up",
      outcome: "win",
      score: 2,
      r: 2,
    }),
    mkCell({
      model: "openai/gpt-5",
      questionId: "swing-MU-01",
      mode: "live",
      rep: 0,
      layer: "high-vol-tech",
      regime: "up",
      outcome: "loss",
      score: -1,
      r: 2,
    }),
    mkCell({
      model: "openai/gpt-5",
      questionId: "swing-MU-02",
      mode: "blind",
      rep: 0,
      layer: "mega-cap",
      regime: "down",
      direction: null,
      entry: null,
      stop: null,
      target: null,
      outcome: "format_violation",
      score: null,
      r: null,
    }),
    mkCell({
      model: "anthropic/claude",
      questionId: "swing-MU-01",
      mode: "blind",
      rep: 0,
      layer: "high-vol-tech",
      regime: "up",
      outcome: "win",
      score: 1,
      r: 1,
      metrics: { durationMs: 20_000, costUsd: 0.05, toolCalls: 4 },
    }),
    mkCell({
      model: "anthropic/claude",
      questionId: "swing-MU-02",
      mode: "blind",
      rep: 0,
      layer: "mega-cap",
      regime: "down",
      outcome: "loss",
      score: -1,
      r: 1,
      metrics: { durationMs: 30_000, costUsd: 0.08, toolCalls: 6 },
    }),
    mkCell({
      model: "baseline/buy-hold",
      questionId: "swing-MU-01",
      mode: "blind",
      rep: 0,
      layer: "high-vol-tech",
      regime: "up",
      outcome: "loss",
      score: -0.5,
      r: 1,
    }),
    mkCell({
      model: "baseline/buy-hold",
      questionId: "swing-MU-02",
      mode: "blind",
      rep: 0,
      layer: "mega-cap",
      regime: "down",
      outcome: "loss",
      score: -0.5,
      r: 1,
    }),
  ];
  const models = aggregate(cells, WEIGHTS);
  return { runId: "run-test-01", datasetVersion: "v1", weights: WEIGHTS, cells, models };
}

describe("renderReport", () => {
  const scores = buildScores();
  const config = {
    runId: "run-test-01",
    gitSha: "abc1234",
    config: {
      models: ["openai/gpt-5", "anthropic/claude"],
      bank: "swing" as const,
      modes: ["blind", "live"] as ("blind" | "live")[],
      repeat: 1,
      datasetVersion: "v1",
      temperatures: {},
      weights: WEIGHTS,
      timeoutMs: 60_000,
    },
  };

  const { markdown, summary } = renderReport(scores, config, { now: FIXED_NOW });
  const lines = markdown.split("\n");

  it("titles the report with the run id", () => {
    expect(lines[0]).toBe("# 模型交易基准报告：run-test-01");
  });

  it("renders 运行信息 with git sha and generated time", () => {
    expect(markdown).toContain("## 运行信息");
    expect(markdown).toContain("- Git SHA：abc1234");
    expect(markdown).toContain("- 生成时间：2026-07-17T12:00:00.000Z");
    expect(markdown).toContain("- 重复次数：1");
  });

  it("renders 总榜 with 15 columns and rank order desc by total", () => {
    const headerIdx = lines.findIndex((l) => l.startsWith("| 排名 |"));
    expect(headerIdx).toBeGreaterThan(-1);
    const headerCells = lines[headerIdx].split("|").filter((c) => c.trim().length > 0);
    expect(headerCells).toHaveLength(15);

    const dataRows = lines.slice(headerIdx + 2, headerIdx + 2 + scores.models.length);
    const totals = dataRows.map((row) => Number(row.split("|")[3].trim()));
    for (let i = 1; i < totals.length; i++) expect(totals[i - 1]).toBeGreaterThanOrEqual(totals[i]);
    expect(dataRows[0]).toContain("|");
  });

  it("marks baseline rows with a suffix tag", () => {
    const baselineRow = lines.find((l) => l.includes("baseline/buy-hold"));
    expect(baselineRow).toBeDefined();
    expect(baselineRow).toContain("（基线）");
  });

  it("renders 分层榜 with three split tables", () => {
    expect(markdown).toContain("### 按股票层");
    expect(markdown).toContain("### 按市场状态");
    expect(markdown).toContain("### 按模式");
    expect(markdown).toContain("上涨段");
    expect(markdown).toContain("下跌段");
    expect(markdown).toContain("盲盘");
    expect(markdown).toContain("实盘");
  });

  it("renders 单题钻取 with one subsection per question and a trace link", () => {
    expect(markdown).toContain("### swing-MU-01");
    expect(markdown).toContain("### swing-MU-02");
    expect(markdown).toContain("[trace](openai-gpt-5/swing-MU-01/blind-rep0.trace.jsonl)");
  });

  it("renders 单题钻取 with 入场/止损/目标 columns for a directional cell", () => {
    const headerIdx = lines.findIndex((l) => l.startsWith("| model | mode | rep |"));
    expect(headerIdx).toBeGreaterThan(-1);
    expect(lines[headerIdx]).toBe("| model | mode | rep | 方向 | 入场 | 止损 | 目标 | 结果 | 得分 | trace |");
    const sectionStart = lines.indexOf("### swing-MU-01");
    const row = lines
      .slice(sectionStart)
      .find((l) => l.startsWith("|") && l.includes("openai/gpt-5") && l.includes("blind"));
    expect(row).toBeDefined();
    const cells = row!.split("|").map((c) => c.trim());
    expect(cells[5]).toBe("100.000");
    expect(cells[6]).toBe("90.000");
    expect(cells[7]).toBe("120.000");
  });

  it("shows format_violation outcome for a failed cell with — prices", () => {
    expect(markdown).toContain("format_violation");
    const sectionStart = lines.indexOf("### swing-MU-02");
    const row = lines
      .slice(sectionStart)
      .find((l) => l.startsWith("|") && l.includes("openai/gpt-5") && l.includes("format_violation"));
    expect(row).toBeDefined();
    const cells = row!.split("|").map((c) => c.trim());
    expect(cells[4]).toBe("—");
    expect(cells[5]).toBe("—");
    expect(cells[6]).toBe("—");
    expect(cells[7]).toBe("—");
    expect(cells[8]).toBe("format_violation");
  });

  it("never emits NaN or undefined", () => {
    expect(markdown).not.toMatch(/NaN|undefined/);
  });

  it("produces a summary that validates against reportSummarySchema", () => {
    expect(Value.Check(reportSummarySchema, summary)).toBe(true);
  });

  it("summary ranks by total and flags models beating buy-hold", () => {
    expect(summary.ranking[0].total).toBeGreaterThanOrEqual(summary.ranking[summary.ranking.length - 1].total);
    expect(summary.baselineComparison.modelsBeatingBuyHold).toContain("openai/gpt-5");
    expect(summary.baselineComparison.modelsBeatingBuyHold).toContain("anthropic/claude");
    expect(summary.baselineComparison.modelsBeatingBuyHold).not.toContain("baseline/buy-hold");
  });
});

describe("renderReport trace links", () => {
  it("renders — instead of a dead link when a cell has no stored traceRef", () => {
    const cells = [mkCell({ model: "baseline/buy-hold", questionId: "q1", outcome: "loss", score: -1, r: 1, traceRef: null })];
    const models = aggregate(cells, WEIGHTS);
    const scores: Scores = { runId: "run-tr", datasetVersion: "v1", weights: WEIGHTS, cells, models };
    const { markdown } = renderReport(scores, {}, { now: FIXED_NOW });
    const lines = markdown.split("\n");
    const idx = lines.indexOf("### q1");
    const row = lines.slice(idx).find((l) => l.startsWith("|") && l.includes("baseline/buy-hold"));
    expect(row).toBeDefined();
    expect(row).not.toContain("[trace]");
    const rowCells = row!.split("|").map((c) => c.trim());
    expect(rowCells[rowCells.length - 2]).toBe("—");
  });

  it("uses the cell's stored traceRef verbatim for the drilldown link", () => {
    const cells = [mkCell({ model: "x/y", questionId: "q1", outcome: "win", score: 1, r: 1, traceRef: "custom/path.trace.jsonl" })];
    const models = aggregate(cells, WEIGHTS);
    const scores: Scores = { runId: "run-tr2", datasetVersion: "v1", weights: WEIGHTS, cells, models };
    const { markdown } = renderReport(scores, {}, { now: FIXED_NOW });
    expect(markdown).toContain("[trace](custom/path.trace.jsonl)");
  });
});

describe("renderReport escaping and determinism", () => {
  it("escapes raw pipes in model names", () => {
    const cells = [mkCell({ model: "weird|model", questionId: "q1", outcome: "win", score: 1, r: 1 })];
    const models = aggregate(cells, WEIGHTS);
    const scores: Scores = { runId: "run-escape", datasetVersion: "v1", weights: WEIGHTS, cells, models };
    const { markdown } = renderReport(scores, {}, { now: FIXED_NOW });
    expect(markdown).toContain("weird\\|model");
  });

  it("breaks total ties by model name ascending", () => {
    const cells = [
      mkCell({ model: "zeta", questionId: "q1", outcome: "win", score: 1, r: 1 }),
      mkCell({ model: "alpha", questionId: "q1", outcome: "win", score: 1, r: 1 }),
    ];
    const models = aggregate(cells, WEIGHTS);
    const scores: Scores = { runId: "run-tie", datasetVersion: "v1", weights: WEIGHTS, cells, models };
    const { summary } = renderReport(scores, {}, { now: FIXED_NOW });
    expect(summary.ranking.map((r) => r.model)).toEqual(["alpha", "zeta"]);
  });
});

describe("renderReport single-mode run", () => {
  it("renders — for noiseDelta when only one mode ran", () => {
    const cells = [
      mkCell({ model: "solo/model", questionId: "q1", mode: "blind", outcome: "win", score: 1, r: 1 }),
      mkCell({ model: "solo/model", questionId: "q2", mode: "blind", outcome: "loss", score: -1, r: 1 }),
    ];
    const models = aggregate(cells, WEIGHTS);
    expect(models[0].noiseDelta).toBeNull();
    const scores: Scores = { runId: "run-solo", datasetVersion: "v1", weights: WEIGHTS, cells, models };
    const { markdown } = renderReport(scores, {}, { now: FIXED_NOW });
    const headerIdx = markdown.split("\n").findIndex((l) => l.startsWith("| 排名 |"));
    const row = markdown.split("\n")[headerIdx + 2];
    const cellsInRow = row.split("|").map((c) => c.trim());
    expect(cellsInRow[9]).toBe("—");
  });

  it("renders — for repeat when config is missing", () => {
    const cells = [mkCell({ model: "solo/model", questionId: "q1", outcome: "win", score: 1, r: 1 })];
    const models = aggregate(cells, WEIGHTS);
    const scores: Scores = { runId: "run-noconfig", datasetVersion: "v1", weights: WEIGHTS, cells, models };
    const { markdown } = renderReport(scores, {}, { now: FIXED_NOW });
    expect(markdown).toContain("- 重复次数：—");
    expect(markdown).toContain("- Git SHA：—");
  });
});
