import { describe, expect, it } from "vitest";
import type { EpisodeAnswer } from "../../src/schema/episode.js";
import type { Question } from "../../src/schema/question.js";
import type { EpisodeDataAudit } from "../../src/episode/audit.js";
import { renderEpisodeReportHtml, type EpisodeReportTraceLine } from "../../src/episode/report.js";

function bar(time: string, open: number, high: number, low: number, close: number) {
  return { time, open, high, low, close, volume: 1_000 };
}

const question: Question = {
  id: "swing-MU-2026-03-25-01",
  bank: "swing",
  symbol: "MU.US",
  cutoff: "2026-03-25T16:00:00-04:00",
  layer: "high-vol-tech",
  adversarial: false,
  fixtures: {
    kline: {
      "1h": [bar("2026-03-25T19:30:00Z", 379, 383, 378, 381.861)],
      day: [bar("2026-03-25T04:00:00Z", 382.77, 388.687, 371.158, 381.861)],
      week: [bar("2026-03-23", 425.889, 444.003, 371.158, 381.861)],
    },
    indicators: {},
    quote: { last: 381.861 },
    capitalFlow: {},
    news: [],
    fundamentals: {},
    calendar: {},
  },
  replay: {
    basePeriod: "1h",
    entryExpiryBars: 21,
    horizonSessions: 1,
    horizonBars: 2,
    bars: [
      bar("2026-03-26T13:30:00Z", 369.908, 374.025, 362.892, 364.731),
      bar("2026-03-26T14:30:00Z", 364.771, 367.349, 360.504, 365.271),
    ],
    rollups: { day: [], week: [] },
  },
};

const answer: EpisodeAnswer = {
  questionId: question.id,
  symbol: question.symbol,
  layer: question.layer,
  model: "openai-codex/<gpt-5.5>",
  mode: "blind",
  rep: 0,
  status: "completed",
  initialSubmission: {
    direction: "short",
    anchor: { timeframe: "h1", time: "2026-03-25T19:30:00Z", price: 381.861 },
    entry_plan: {
      entry: 379.5,
      stop: 389.2,
      target1: 361,
      rationale: "日线与周线共同转弱。",
    },
    scenarios: [
      { label: "下跌", probability: 60 },
      { label: "反弹", probability: 40 },
    ],
    decision_reason: { category: "breakout", summary: "日线与周线同步跌破关键支撑。" },
    comment: "测试",
  },
  result: {
    terminationReason: "horizon",
    direction: "short",
    entry: { time: "2026-03-26T14:30:00Z", price: 364.771 },
    exit: { time: "2026-03-26T14:30:00Z", price: 361 },
    initialRisk: 24.429,
    grossR: 0.4617458,
    frictionR: 0.0189433,
    netR: 0.4428025,
    mfeR: 0.4874559,
    maeR: 0.2134045,
    holdingBars: 1,
    steps: 3,
    decisionBar: 1,
    decisionTime: "2026-03-26T13:30:00Z",
    observationBars: 1,
    trades: [{
      tradeId: 1,
      direction: "short",
      decisionBar: 1,
      decisionTime: "2026-03-26T13:30:00Z",
      entry: { time: "2026-03-26T14:30:00Z", price: 364.771 },
      exit: { time: "2026-03-26T14:30:00Z", price: 361 },
      exitReason: "target",
      initialStop: 389.2,
      finalStop: 389.2,
      target: 361,
      initialRisk: 24.429,
      grossR: 0.4617458,
      frictionR: 0.0189433,
      netR: 0.4428025,
      mfeR: 0.4874559,
      maeR: 0.2134045,
      holdingBars: 1,
      entryReason: { category: "breakout", summary: "日线与周线同步跌破关键支撑。" },
    }],
    tradeCount: 1,
    winCount: 1,
    lossCount: 0,
    maxDrawdownR: 0,
    actions: [
      { step: 1, at: question.cutoff, effectiveBarTime: "2026-03-26T13:30:00Z", action: { type: "observe" } },
      {
        step: 2,
        tradeId: 1,
        at: "2026-03-26T13:30:00Z",
        effectiveBarTime: "2026-03-26T14:30:00Z",
        action: {
          type: "submit",
          direction: "short",
          entry: 379.5,
          stop: 389.2,
          target: 361,
          reason: { category: "breakout", summary: "日线与周线同步跌破关键支撑。" },
        },
      },
      {
        step: 3,
        tradeId: 1,
        at: "2026-03-26T13:30:00Z",
        effectiveBarTime: "2026-03-26T14:30:00Z",
        action: { type: "hold", reason: { category: "risk_management", summary: "止损仍有效，继续执行原计划。" } },
      },
    ],
  },
  metrics: { durationMs: 25_095, costUsd: 0.12715, toolCalls: 7, inputTokens: 10_490, outputTokens: 826 },
  traceRef: "trace.jsonl",
};

const audit: EpisodeDataAudit = {
  questionId: question.id,
  symbol: question.symbol,
  auditedAt: "2026-07-18T00:00:00.000Z",
  source: "longbridge-cli",
  passed: true,
  checks: [{ id: "source-day", label: "日线与长桥 CLI 完整匹配", status: "pass", expected: 1, actual: 1 }],
  configuration: {
    cutoff: question.cutoff,
    basePeriod: "1h",
    initialBars: { h1: 1, day: 1, week: 1 },
    horizonSessions: 1,
    horizonBars: 2,
    decisionExpiryBars: null,
    entryExpiryBars: 21,
    dayRollups: 0,
    weekRollups: 0,
  },
};

describe("episode HTML report", () => {
  const traces = new Map<string, EpisodeReportTraceLine[]>([
    [answer.traceRef, [
      { type: "prompt_context", barIndex: 0, phase: "flat", remainingBars: 2, tradeCount: 0, episodeNetR: 0, warningInjected: true, warningPriority: "high" },
      { type: "tool_call", sequence: 1, name: "fetch_kline", args: { period: "h1", count: 40 }, contextBefore: { barIndex: 0, phase: "flat" }, contextAfter: { barIndex: 0, phase: "flat" }, durationMs: 3 },
      { type: "tool_call", sequence: 2, name: "fetch_kline", args: { period: "day", count: 60 }, contextBefore: { barIndex: 0, phase: "flat" }, contextAfter: { barIndex: 0, phase: "flat" }, durationMs: 2 },
      { type: "tool_call", sequence: 3, name: "fetch_kline", args: { period: "week", count: 30 }, contextBefore: { barIndex: 0, phase: "flat" }, contextAfter: { barIndex: 0, phase: "flat" }, durationMs: 2 },
      { type: "tool_call", sequence: 4, name: "observe_next_bar", args: {}, contextBefore: { barIndex: 0, phase: "flat" }, contextAfter: { barIndex: 1, phase: "flat" }, resultSummary: '{"barIndex":1,"event":"observed","terminal":false}', durationMs: 1 },
      { type: "prompt_context", barIndex: 1, phase: "flat", remainingBars: 1, tradeCount: 0, episodeNetR: 0, warningInjected: true, warningPriority: "critical" },
      { type: "tool_call", sequence: 5, name: "submit_prediction", args: { direction: "short", decision_reason: { category: "breakout", summary: "日线与周线同步跌破关键支撑。" } }, contextBefore: { barIndex: 1, phase: "flat" }, contextAfter: { barIndex: 1, phase: "pending", decisionBar: 1 }, resultSummary: '{"barIndex":1,"event":"waiting_fill","terminal":false}', durationMs: 2 },
      { type: "tool_call", sequence: 6, name: "advance_trade", args: { type: "hold", reason: { category: "risk_management", summary: "止损仍有效，继续执行原计划。" } }, contextBefore: { barIndex: 1, phase: "pending", decisionBar: 1 }, contextAfter: { barIndex: 2, phase: "terminal", decisionBar: 1 }, resultSummary: '{"barIndex":2,"event":"target_hit","terminal":true}', durationMs: 1 },
    ]],
  ]);
  const rendered = renderEpisodeReportHtml({
    answers: [answer],
    questions: new Map([[question.id, question]]),
    config: {
      runId: "episode-test",
      datasetVersion: "v2-preview",
      costBps: 5,
      gitSha: "deadbeef",
      config: { models: [answer.model], modes: ["blind"], repeat: 1, timeoutMs: 600_000 },
    },
    audits: [audit],
    traces,
    now: () => new Date("2026-07-18T12:00:00Z"),
  });

  it("renders a compact report with return, risk, and three TradingView ranges", () => {
    expect(rendered.html).toContain("<!doctype html>");
    expect(rendered.html).toContain("episode-test");
    expect(rendered.html).toContain("平均净 R / case");
    expect(rendered.html).toContain("Episode 胜率");
    expect(rendered.html).toContain("交易胜率");
    expect(rendered.html).toContain("止损");
    expect(rendered.html).toContain("止盈");
    expect(rendered.html).toContain("379.50");
    expect(rendered.html).toContain("389.20");
    expect(rendered.html).toContain("361.00");
    expect(rendered.html).toContain("lightweight-charts@5.2.0");
    expect(rendered.html).toContain("CandlestickSeries");
    expect(rendered.html).toContain("HistogramSeries");
    expect(rendered.html).toContain('data-timeframe="h1"');
    expect(rendered.html).toContain('data-timeframe="day"');
    expect(rendered.html).toContain('data-timeframe="week"');
    expect(rendered.html).toContain("T1 成交 364.77");
    expect(rendered.html).toContain("T1 止盈 361.00");
    expect(rendered.html).toContain("长桥数据已校验");
    expect(rendered.html).toContain("CASE START · B0");
    expect(rendered.html).toContain("B1 · 首根回放");
    expect(rendered.html).toContain("T1 决策 B1");
    expect(rendered.html).toContain("B2 · 强制结算");
    expect(rendered.html).toContain("可观察决策链");
    expect(rendered.html).toContain("周线 × 30");
    expect(rendered.html).toContain('data-bar-index="1"');
    expect(rendered.html).toContain("T-2 强平提醒");
    expect(rendered.html).toContain("T-1 强平提醒");
    expect(rendered.html).toContain("过程检查 5/5");
    expect(rendered.html).toContain("交易原因统计");
    expect(rendered.html).toContain("理由覆盖 2/2 · 100.0%");
    expect(rendered.html).toContain("日线与周线同步跌破关键支撑");
    expect(rendered.html).toContain("止损仍有效，继续执行原计划");
    expect(rendered.html).toContain("payload.snapshotPatches");
  });

  it("escapes dynamic values and never emits invalid numeric placeholders", () => {
    expect(rendered.html).toContain("openai-codex/&lt;gpt-5.5&gt;");
    expect(rendered.html).not.toContain("openai-codex/<gpt-5.5>");
    expect(rendered.html).not.toMatch(/NaN|undefined/);
  });

  it("returns a machine-readable summary", () => {
    expect(rendered.summary).toMatchObject({
      runId: "episode-test",
      totalCases: 1,
      completionRate: 1,
      averageNetRPerCase: 0.4428025,
      winRate: 1,
      totalTrades: 1,
      tradeWinRate: 1,
      tradeExpectancyR: 0.4428025,
      averageHoldingBars: 1,
      averageMfeR: 0.4874559,
      averageMaeR: 0.2134045,
      averageMaxDrawdownR: 0,
      averageToolCalls: 7,
      averageTokens: 11_316,
      averageDecisionBars: 1,
      reasonCoverage: 1,
      reasonedActions: 2,
      decisionActions: 2,
      reasonCoverageByModel: [{
        model: answer.model,
        reasonedActions: 2,
        decisionActions: 2,
        coverage: 1,
      }],
      dataAuditPassed: true,
    });
    expect(rendered.summary.reasonStats).toEqual([
      {
        model: answer.model,
        category: "breakout",
        actions: 1,
        actionBreakdown: { submit: 1 },
        entries: 1,
        trades: 1,
        wins: 1,
        winRate: 1,
        averageNetR: 0.4428025,
        totalNetR: 0.4428025,
      },
      {
        model: answer.model,
        category: "risk_management",
        actions: 1,
        actionBreakdown: { hold: 1 },
        entries: 0,
        trades: 0,
        wins: 0,
        winRate: null,
        averageNetR: null,
        totalNetR: 0,
      },
    ]);
  });
});
