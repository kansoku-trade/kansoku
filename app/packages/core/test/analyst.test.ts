import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CockpitComment } from "../../../shared/types.js";
import type { AiAgentFactory, AiAgentHandle } from "../src/ai/agentSession.js";
import {
  analystRunStatus,
  type AnalystDeps,
  buildAnalystSystemPrompt,
  buildJournalTool,
  escalationOnCooldown,
  executeAnalystRun,
  runAnalyst,
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
    event_risk: null,
    lessons: [],
    market: { spy: null, qqq: null },
    news: [],
    prediction: null,
    prediction_chart_id: null,
    position: null,
    ...overrides,
  };
}

type Tools = Parameters<AiAgentFactory>[0]["tools"];

interface Harness {
  deps: AnalystDeps;
  comments: CockpitComment[];
  createCalls: Record<string, unknown>[];
  klineCalls: { period: string; count: number }[];
  bashCalls: string[];
  systemPrompts: string[];
}

const FAKE_SKILL = "# intraday-signal\n假技能全文。";

function harness(
  script: (tools: Tools) => Promise<void>,
  opts: {
    pack?: ReassessPack;
    timeoutMs?: number;
    createChart?: AnalystDeps["createChart"];
    hang?: boolean;
    onAbort?: () => void;
    skillText?: string | null;
  } = {},
): Harness {
  const comments: CockpitComment[] = [];
  const createCalls: Record<string, unknown>[] = [];
  const klineCalls: { period: string; count: number }[] = [];
  const bashCalls: string[] = [];
  const systemPrompts: string[] = [];
  const sandbox = mkdtempSync(join(tmpdir(), "analyst-test-"));

  const createChart =
    opts.createChart ??
    (async (body: Record<string, unknown>) => {
      createCalls.push(body);
      return { id: "chart-new", url: "http://localhost/#/charts/chart-new" };
    });

  const agentFactory: AiAgentFactory = ({ tools, systemPrompt }) => {
    systemPrompts.push(systemPrompt);
    const agent: AiAgentHandle = {
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
    repoRoot: sandbox,
    journalDir: join(sandbox, "journal"),
    exec: async (command) => {
      bashCalls.push(command);
      return { stdout: "ok", stderr: "" };
    },
    ...("skillText" in opts ? (opts.skillText == null ? {} : { skillText: opts.skillText }) : { skillText: FAKE_SKILL }),
  };

  return { deps, comments, createCalls, klineCalls, bashCalls, systemPrompts };
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

describe("skill-based system prompt", () => {
  it("embeds the intraday-signal skill text after the adapter preamble", async () => {
    const { deps, systemPrompts } = harness(async () => {});
    await executeAnalystRun("MU.US", deps);
    expect(systemPrompts).toHaveLength(1);
    expect(systemPrompts[0]).toContain("假技能全文");
    expect(systemPrompts[0].indexOf("in-app 环境映射")).toBeLessThan(systemPrompts[0].indexOf("假技能全文"));
    expect(buildAnalystSystemPrompt("SKILL BODY")).toContain("SKILL BODY");
  });

  it("aborts with an error comment when the skill file is missing", async () => {
    const { deps, comments, systemPrompts } = harness(async () => {}, { skillText: null });
    await executeAnalystRun("MU.US", deps);
    expect(systemPrompts).toHaveLength(0);
    expect(comments).toHaveLength(1);
    expect(comments[0].level).toBe("error");
    expect(comments[0].text).toContain("SKILL.md");
  });

  it("bash runs through the injected exec and rejects write commands", async () => {
    let out: string | undefined;
    let rejected: string | undefined;
    const { deps, bashCalls } = harness(async (tools) => {
      const ok = await tool(tools, "bash").execute("c1", { command: "longbridge quote SPY.US" });
      out = (ok.content[0] as { text: string }).text;
      const bad = await tool(tools, "bash").execute("c2", { command: "echo hi > /tmp/x" });
      rejected = (bad.content[0] as { text: string }).text;
    });
    await executeAnalystRun("MU.US", deps);
    expect(bashCalls).toEqual(["longbridge quote SPY.US"]);
    expect(out).toBe("ok");
    expect(rejected).toContain("rejected");
  });
});

describe("buildJournalTool", () => {
  const now = () => Date.parse("2026-07-13T18:00:00Z");

  it("creates then appends the dated journal file, stripping the .US suffix", async () => {
    const dir = mkdtempSync(join(tmpdir(), "journal-test-"));
    const journal = buildJournalTool("MU.US", dir, now);
    await journal.execute("c1", { content: "## 第一节" });
    const second = await journal.execute("c2", { content: "## 第二节" });
    const file = readFileSync(join(dir, "2026-07-13-MU-intraday.md"), "utf8");
    expect(file).toBe("## 第一节\n\n---\n\n## 第二节");
    expect((second.content[0] as { text: string }).text).toContain("appended");
  });

  it("rejects empty content", async () => {
    const dir = mkdtempSync(join(tmpdir(), "journal-test-"));
    const journal = buildJournalTool("MU.US", dir, now);
    const res = await journal.execute("c1", { content: "   " });
    expect((res.content[0] as { text: string }).text).toContain("rejected");
  });
});

describe("runAnalyst gating", () => {
  it("exposes the active run until the analyst finishes", async () => {
    const symbol = "STATUS.US";
    const startedAt = "2026-07-14T02:03:04.000Z";
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { deps } = harness(async () => wait);

    const run = runAnalyst({
      symbol,
      origin: "manual",
      deps: { ...deps, now: () => Date.parse(startedAt) },
    });

    expect(run.started).toBe(true);
    expect(analystRunStatus(symbol)).toEqual({ running: true, startedAt });

    release();
    await run.done;
    expect(analystRunStatus(symbol)).toEqual({ running: false });
  });

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
