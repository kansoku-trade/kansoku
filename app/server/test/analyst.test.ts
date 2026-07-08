import { describe, expect, it } from "vitest";
import type { CockpitComment } from "../../shared/types.js";
import {
  type AnalystAgent,
  type AnalystAgentFactory,
  type AnalystDeps,
  escalationOnCooldown,
  executeAnalystRun,
  runAnalyst,
  validatePrediction,
} from "../src/ai/analyst.js";
import type { ReassessPack } from "../src/ai/datapack.js";
import type { AiModel } from "../src/ai/models.js";

const fakeModel = { provider: "anthropic", id: "claude-haiku-4-5" } as unknown as AiModel;
const ESCALATION_MS = 30 * 60_000;

function makePack(overrides: Partial<ReassessPack> = {}): ReassessPack {
  return {
    symbol: "MU.US",
    as_of: "2026-07-05T15:00:00.000Z",
    timeframes: {} as ReassessPack["timeframes"],
    flow: [],
    rel_volume: null,
    day_levels: null,
    day_context: null,
    options_levels: null,
    lessons: [],
    market: { spy: null, qqq: null },
    news: [],
    prediction: null,
    prediction_chart_id: null,
    position: null,
    ...overrides,
  };
}

type Tools = Parameters<AnalystAgentFactory>[0]["tools"];

interface Harness {
  deps: AnalystDeps;
  comments: CockpitComment[];
  createCalls: Record<string, unknown>[];
  klineCalls: { period: string; count: number }[];
}

function harness(
  script: (tools: Tools) => Promise<void>,
  opts: {
    pack?: ReassessPack;
    timeoutMs?: number;
    createChart?: AnalystDeps["createChart"];
    hang?: boolean;
    onAbort?: () => void;
  } = {},
): Harness {
  const comments: CockpitComment[] = [];
  const createCalls: Record<string, unknown>[] = [];
  const klineCalls: { period: string; count: number }[] = [];

  const createChart =
    opts.createChart ??
    (async (body: Record<string, unknown>) => {
      createCalls.push(body);
      return { id: "chart-new", url: "http://localhost/#/charts/chart-new" };
    });

  const agentFactory: AnalystAgentFactory = ({ tools }) => {
    const agent: AnalystAgent = {
      prompt: opts.hang ? () => new Promise<void>(() => {}) : () => script(tools),
      abort: () => opts.onAbort?.(),
    };
    return agent;
  };

  const deps: AnalystDeps = {
    model: fakeModel,
    agentFactory,
    buildReassessPack: async () => opts.pack ?? makePack(),
    fetchNews: async () => [{ id: "1", title: "news", published_at: "", url: "" }],
    fetchKline: async (_symbol, period, count) => {
      klineCalls.push({ period, count });
      return [];
    },
    createChart,
    appendComment: async (c) => {
      comments.push(c);
    },
    timeoutMs: opts.timeoutMs,
  };

  return { deps, comments, createCalls, klineCalls };
}

function tool(tools: Tools, name: string) {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
}

const validPrediction = {
  direction: "long" as const,
  anchor: { timeframe: "m5" as const, time: "2026-07-05T15:00:00Z", price: 100 },
  entry_plan: { entry: 100, stop: 97, target1: 104, target2: 108 },
  scenarios: [
    { label: "上破", probability: 50 },
    { label: "震荡", probability: 30 },
    { label: "下破", probability: 20 },
  ],
  comment: "多头结构完好，站上 100 看 104。",
};

describe("validatePrediction", () => {
  it("passes a coherent long plan", () => {
    expect(validatePrediction(validPrediction)).toEqual([]);
  });

  it("rejects a long plan whose stop sits above the entry", () => {
    const issues = validatePrediction({
      ...validPrediction,
      entry_plan: { entry: 100, stop: 103, target1: 104 },
    });
    expect(issues.join("")).toContain("止损必须低于入场价");
  });

  it("rejects a plan whose T1 reward is below 1:1", () => {
    const issues = validatePrediction({
      ...validPrediction,
      entry_plan: { entry: 100, stop: 96, target1: 102 },
    });
    expect(issues.join("")).toContain("不足 1:1");
  });

  it("rejects a short plan whose target1 sits above the entry", () => {
    const issues = validatePrediction({
      ...validPrediction,
      direction: "short",
      entry_plan: { entry: 100, stop: 103, target1: 105 },
    });
    expect(issues.join("")).toContain("做空 target1 必须低于入场价");
  });

  it("rejects scenario probabilities that do not sum to ~100", () => {
    const issues = validatePrediction({
      ...validPrediction,
      scenarios: [
        { label: "上破", probability: 0.5 },
        { label: "震荡", probability: 0.3 },
        { label: "下破", probability: 0.2 },
      ],
    });
    expect(issues.join("")).toContain("约为 100");
  });

  it("resolves pct-based targets before judging R/R", () => {
    const issues = validatePrediction({
      ...validPrediction,
      entry_plan: { entry: 100, stop: 98, target1_pct: 1 },
    });
    expect(issues.join("")).toContain("不足 1:1");
  });

  it("passes a neutral call with a range zone and no entry plan", () => {
    const { entry_plan: _plan, ...rest } = validPrediction;
    expect(
      validatePrediction({
        ...rest,
        direction: "neutral",
        range_plan: { low: 97, high: 104, long_tactic: "回踩 97 收稳做多", short_tactic: "反抽 104 受阻做空" },
      }),
    ).toEqual([]);
  });

  it("rejects a neutral call that carries an entry plan", () => {
    const issues = validatePrediction({
      ...validPrediction,
      direction: "neutral",
      range_plan: { low: 97, high: 104 },
      entry_plan: { entry: 100, stop: 103, target1: 99 },
    });
    expect(issues.join("")).toContain("不应提交 entry_plan");
  });

  it("rejects a neutral call without a range zone", () => {
    const { entry_plan: _plan, ...rest } = validPrediction;
    const issues = validatePrediction({ ...rest, direction: "neutral" });
    expect(issues.join("")).toContain("箱体下沿 low / 上沿 high");
  });

  it("rejects a neutral zone that does not contain the anchor price", () => {
    const { entry_plan: _plan, ...rest } = validPrediction;
    const issues = validatePrediction({
      ...rest,
      direction: "neutral",
      range_plan: { low: 104, high: 110 },
    });
    expect(issues.join("")).toContain("包住锚点价格");
  });

  it("rejects a directional call without an entry plan", () => {
    const { entry_plan: _plan, ...rest } = validPrediction;
    const issues = validatePrediction({ ...rest, direction: "long" });
    expect(issues.join("")).toContain("必须给出 entry_plan");
  });

  it("rejects a directional plan without any target", () => {
    const issues = validatePrediction({
      ...validPrediction,
      entry_plan: { entry: 100, stop: 97 },
    });
    expect(issues.join("")).toContain("必须给出 target1 或 target1_pct");
  });
});

describe("analyst tools", () => {
  it("read_data_pack returns the pack json", async () => {
    let payload: string | undefined;
    const { deps } = harness(async (tools) => {
      const res = await tool(tools, "read_data_pack").execute("c1", {});
      payload = (res.content[0] as { text: string }).text;
    });
    await executeAnalystRun("MU.US", deps);
    expect(JSON.parse(payload!).symbol).toBe("MU.US");
  });

  it("fetch_kline clamps period alias and count ceiling", async () => {
    const { deps, klineCalls } = harness(async (tools) => {
      await tool(tools, "fetch_kline").execute("c1", { period: "m5", count: 9999 });
      await tool(tools, "fetch_kline").execute("c2", { period: "h1", count: 10 });
      await tool(tools, "fetch_kline").execute("c3", { period: "day" });
    });
    await executeAnalystRun("MU.US", deps);
    expect(klineCalls).toEqual([
      { period: "5m", count: 500 },
      { period: "1h", count: 10 },
      { period: "day", count: 200 },
    ]);
  });

  it("submit_prediction creates the chart, terminates and returns the chartId", async () => {
    let res: Awaited<ReturnType<Tools[number]["execute"]>> | undefined;
    const { deps, comments, createCalls } = harness(async (tools) => {
      res = await tool(tools, "submit_prediction").execute("c1", validPrediction);
    });
    await executeAnalystRun("MU.US", deps);

    expect(res!.terminate).toBe(true);
    expect(JSON.parse((res!.content[0] as { text: string }).text).chartId).toBe("chart-new");
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].type).toBe("intraday");
    expect(createCalls[0].symbol).toBe("MU.US");
    expect((createCalls[0].prediction as { direction: string }).direction).toBe("long");
    expect((createCalls[0].prediction as Record<string, unknown>).comment).toBeUndefined();

    const analyst = comments.filter((c) => c.source === "analyst");
    expect(analyst).toHaveLength(1);
    expect(analyst[0].chartId).toBe("chart-new");
    expect(analyst[0].text).toContain("多头结构");
  });

  it("append_comment persists an analyst comment carrying the current chartId", async () => {
    const { deps, comments } = harness(
      async (tools) => {
        await tool(tools, "read_data_pack").execute("c1", {});
        await tool(tools, "append_comment").execute("c2", { level: "warn", text: "量能背离" });
      },
      { pack: makePack({ prediction_chart_id: "old-chart" }) },
    );
    await executeAnalystRun("MU.US", deps);

    const analyst = comments.filter((c) => c.source === "analyst");
    expect(analyst).toHaveLength(1);
    expect(analyst[0].level).toBe("warn");
    expect(analyst[0].text).toBe("量能背离");
    expect(analyst[0].chartId).toBe("old-chart");
  });

  it("submit_prediction rejects an incoherent plan without creating a chart", async () => {
    let text: string | undefined;
    const { deps, createCalls } = harness(async (tools) => {
      const res = await tool(tools, "submit_prediction").execute("c1", {
        ...validPrediction,
        entry_plan: { entry: 100, stop: 103, target1: 104 },
      });
      text = (res.content[0] as { text: string }).text;
    });
    await executeAnalystRun("MU.US", deps);
    expect(text).toContain("未通过校验");
    expect(createCalls).toHaveLength(0);
  });

  it("writes a system error comment when the agent never submits", async () => {
    const { deps, comments } = harness(async () => {});
    await executeAnalystRun("MU.US", deps);
    expect(comments).toHaveLength(1);
    expect(comments[0].source).toBe("system");
    expect(comments[0].level).toBe("error");
  });

  it("aborts and writes an error comment past the timeout", async () => {
    let aborted = false;
    const { deps, comments } = harness(async () => {}, {
      hang: true,
      timeoutMs: 10,
      onAbort: () => {
        aborted = true;
      },
    });
    await executeAnalystRun("MU.US", deps);
    expect(aborted).toBe(true);
    expect(comments).toHaveLength(1);
    expect(comments[0].level).toBe("error");
    expect(comments[0].text).toContain("超时");
  });
});

describe("runAnalyst gating", () => {
  it("blocks a second run for the same symbol while one is in flight", async () => {
    const symbol = "LOCK.US";
    const { deps } = harness(async () => {}, { hang: true });
    const first = runAnalyst({ symbol, origin: "manual", deps });
    expect(first.started).toBe(true);
    const second = runAnalyst({ symbol, origin: "manual", deps });
    expect(second.started).toBe(false);
    expect(second.reason).toBe("already running");
  });

  it("rejects an escalation within cooldown but always allows manual", async () => {
    const symbol = "COOL.US";
    const t0 = 1_000_000;
    const first = runAnalyst({
      symbol,
      origin: "escalation",
      deps: { ...harness(async () => {}).deps, now: () => t0 },
    });
    expect(first.started).toBe(true);
    await first.done;

    expect(escalationOnCooldown(symbol, t0 + 1000)).toBe(true);

    const blocked = runAnalyst({
      symbol,
      origin: "escalation",
      deps: { ...harness(async () => {}).deps, now: () => t0 + 1000 },
    });
    expect(blocked.started).toBe(false);
    expect(blocked.reason).toContain("cooldown");

    const manual = runAnalyst({
      symbol,
      origin: "manual",
      deps: { ...harness(async () => {}).deps, now: () => t0 + 1000 },
    });
    expect(manual.started).toBe(true);
    await manual.done;

    expect(escalationOnCooldown(symbol, t0 + ESCALATION_MS + 1)).toBe(false);
  });
});
