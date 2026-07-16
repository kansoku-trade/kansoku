import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChartMeta, CockpitComment } from "../../../shared/types.js";

const store = vi.hoisted(() => ({
  listCharts: vi.fn(),
  loadChart: vi.fn(),
  allocateId: vi.fn(),
  saveChart: vi.fn(),
  createChart: vi.fn(),
  deleteChart: vi.fn(),
}));

const follows = vi.hoisted(() => ({
  listFollowedSymbols: vi.fn<() => string[]>(),
}));

vi.mock("../src/services/store.js", () => store);
vi.mock("../src/ai/follows.js", () => follows);

const { createAiScheduler, discoverIntradayTargets } = await import("../src/ai/scheduler.js");
import type { SchedulerDeps } from "../src/ai/scheduler.js";
import type { CommentPack } from "../src/ai/datapack.js";
import type { AiModel } from "../src/ai/models.js";
import type { Trigger } from "../src/ai/triggers.js";

const fakeModel = { provider: "anthropic", id: "haiku" } as unknown as AiModel;

function makePack(symbol: string, overrides: Partial<CommentPack> = {}): CommentPack {
  return {
    symbol,
    as_of: "2026-07-05T15:00:00.000Z",
    quote: {} as CommentPack["quote"],
    m5: { bars: [], macd: { dif: [], dea: [], hist: [] } },
    flow: [],
    prediction: null,
    recent_comments: [],
    day_levels: { prev_day: null, pre_market: null, opening_range: null },
    rel_volume: null,
    ...overrides,
  };
}

interface Recorded {
  commentatorCalls: { symbol: string; trigger: Trigger }[];
  analystCalls: { symbol: string; origin: string }[];
  comments: CockpitComment[];
  recaps: string[];
}

function harness(overrides: Partial<SchedulerDeps> = {}): { deps: SchedulerDeps; rec: Recorded } {
  const rec: Recorded = { commentatorCalls: [], analystCalls: [], comments: [], recaps: [] };
  const deps: SchedulerDeps = {
    now: () => 1_000_000,
    aiConfig: () => ({ commentModel: fakeModel, analystModel: fakeModel, deepDiveModel: null, chatModel: null }),
    sessionKind: () => "regular",
    discoverTargets: async () => ["MU.US"],
    discoverPreTargets: async () => ["MU.US"],
    buildCommentPack: async (symbol) => makePack(symbol),
    detectTriggers: () => [],
    shouldHeartbeat: () => false,
    latestCommentatorRunAt: async () => null,
    runCommentator: async ({ symbol, trigger }) => {
      rec.commentatorCalls.push({ symbol, trigger });
      return { escalate: false };
    },
    runAnalyst: ({ symbol, origin }) => {
      rec.analystCalls.push({ symbol, origin });
      return { started: true, done: Promise.resolve() };
    },
    escalationOnCooldown: () => false,
    appendComment: async (comment) => {
      rec.comments.push(comment);
    },
    runRecap: async (date) => {
      rec.recaps.push(date);
    },
    ...overrides,
  };
  return { deps, rec };
}

beforeEach(() => {
  store.listCharts.mockReset();
  follows.listFollowedSymbols.mockReset();
  follows.listFollowedSymbols.mockReturnValue([]);
});

describe("aiScheduler tick", () => {
  it("does nothing overnight", async () => {
    const discoverTargets = vi.fn(async () => ["MU.US"]);
    const { deps, rec } = harness({ sessionKind: () => "overnight", discoverTargets });
    await createAiScheduler(deps).tick();
    expect(discoverTargets).not.toHaveBeenCalled();
    expect(rec.commentatorCalls).toHaveLength(0);
  });

  it("does nothing when the comment model is unresolved", async () => {
    const discoverTargets = vi.fn(async () => ["MU.US"]);
    const { deps, rec } = harness({
      aiConfig: () => ({ commentModel: null, analystModel: null, deepDiveModel: null, chatModel: null }),
      discoverTargets,
    });
    await createAiScheduler(deps).tick();
    expect(discoverTargets).not.toHaveBeenCalled();
    expect(rec.commentatorCalls).toHaveLength(0);
  });

  it("does nothing when there are no targets", async () => {
    const { deps, rec } = harness({ discoverTargets: async () => [] });
    await createAiScheduler(deps).tick();
    expect(rec.commentatorCalls).toHaveLength(0);
  });

  it("runs the commentator with a combined trigger string when a trigger fires", async () => {
    const { deps, rec } = harness({
      detectTriggers: () => [
        { kind: "macd_cross", detail: "hist 0.1 -> -0.1" },
        { kind: "flow_flip", detail: "net inflow -> outflow" },
      ],
    });
    await createAiScheduler(deps).tick();
    expect(rec.commentatorCalls).toHaveLength(1);
    expect(rec.commentatorCalls[0].symbol).toBe("MU.US");
    expect(rec.commentatorCalls[0].trigger.detail).toContain("macd_cross: hist 0.1 -> -0.1");
    expect(rec.commentatorCalls[0].trigger.detail).toContain("flow_flip: net inflow -> outflow");
  });

  it("runs a heartbeat commentator when no trigger fires but heartbeat is due", async () => {
    const { deps, rec } = harness({ detectTriggers: () => [], shouldHeartbeat: () => true });
    await createAiScheduler(deps).tick();
    expect(rec.commentatorCalls).toHaveLength(1);
    expect(rec.commentatorCalls[0].trigger.kind).toBe("heartbeat");
  });

  it("skips when there is no trigger and heartbeat is not due", async () => {
    const { deps, rec } = harness({ detectTriggers: () => [], shouldHeartbeat: () => false });
    await createAiScheduler(deps).tick();
    expect(rec.commentatorCalls).toHaveLength(0);
  });

  it("escalates to the analyst when the commentator escalates and no cooldown blocks", async () => {
    const { deps, rec } = harness({
      detectTriggers: () => [{ kind: "level_break", detail: "broke stop" }],
      runCommentator: async () => ({ escalate: true }),
      escalationOnCooldown: () => false,
    });
    await createAiScheduler(deps).tick();
    expect(rec.analystCalls).toEqual([{ symbol: "MU.US", origin: "escalation" }]);
  });

  it("does not escalate when the escalation is on cooldown", async () => {
    const { deps, rec } = harness({
      detectTriggers: () => [{ kind: "level_break", detail: "broke stop" }],
      runCommentator: async () => ({ escalate: true }),
      escalationOnCooldown: () => true,
    });
    await createAiScheduler(deps).tick();
    expect(rec.analystCalls).toHaveLength(0);
  });

  it("does not escalate when the analyst model is unresolved", async () => {
    const { deps, rec } = harness({
      aiConfig: () => ({ commentModel: fakeModel, analystModel: null, deepDiveModel: null, chatModel: null }),
      detectTriggers: () => [{ kind: "level_break", detail: "broke stop" }],
      runCommentator: async () => ({ escalate: true }),
    });
    await createAiScheduler(deps).tick();
    expect(rec.analystCalls).toHaveLength(0);
  });

  it("feeds real entry/stop/target1/target2 into trigger levels", async () => {
    let seen: import("../src/ai/triggers.js").TriggerInput | null = null;
    const { deps } = harness({
      buildCommentPack: async (symbol) =>
        makePack(symbol, {
          prediction: {
            chartId: "c1",
            direction: "long",
            anchor: { timeframe: "m5", time: "2026-07-05T15:00:00Z", price: 99 },
            entry: 100,
            stop: 96,
            target1: 106,
            target2: 112,
            zones: [{ label: "阻力", low: 108, high: 110 }],
          },
        }),
      detectTriggers: (input) => {
        seen = input;
        return [];
      },
      shouldHeartbeat: () => true,
    });
    await createAiScheduler(deps).tick();
    expect(seen!.levels).toEqual({ entry: 100, stop: 96, target1: 106, target2: 112 });
    expect(seen!.zones).toEqual([{ label: "阻力", low: 108, high: 110 }]);
  });

  it("feeds day levels into the trigger input", async () => {
    let seen: import("../src/ai/triggers.js").TriggerInput | null = null;
    const { deps } = harness({
      buildCommentPack: async (symbol) =>
        makePack(symbol, {
          day_levels: {
            prev_day: { high: 110, low: 100, close: 105 },
            pre_market: { high: 108, low: 104 },
            opening_range: { high: 107, low: 105 },
          },
        }),
      detectTriggers: (input) => {
        seen = input;
        return [];
      },
      shouldHeartbeat: () => true,
    });
    await createAiScheduler(deps).tick();
    expect(seen!.dayLevels).toEqual([
      { name: "prev_day_high", value: 110 },
      { name: "prev_day_low", value: 100 },
      { name: "pre_market_high", value: 108 },
      { name: "pre_market_low", value: 104 },
      { name: "opening_range_high", value: 107 },
      { name: "opening_range_low", value: 105 },
    ]);
  });

  it("swallows and logs a discoverTargets throw, later ticks still run", async () => {
    let calls = 0;
    const { deps, rec } = harness({
      discoverTargets: async () => {
        calls++;
        if (calls === 1) throw new Error("discover boom");
        return ["MU.US"];
      },
      detectTriggers: () => [{ kind: "macd_cross", detail: "x" }],
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const scheduler = createAiScheduler(deps);
    await expect(scheduler.tick()).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    expect(rec.commentatorCalls).toHaveLength(0);
    await scheduler.tick();
    expect(rec.commentatorCalls.map((c) => c.symbol)).toEqual(["MU.US"]);
    errSpy.mockRestore();
  });

  it("keeps processing later symbols when one symbol throws", async () => {
    const { deps, rec } = harness({
      discoverTargets: async () => ["BAD.US", "MU.US"],
      buildCommentPack: async (symbol) => {
        if (symbol === "BAD.US") throw new Error("boom");
        return makePack(symbol);
      },
      detectTriggers: () => [{ kind: "macd_cross", detail: "x" }],
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await createAiScheduler(deps).tick();
    expect(rec.commentatorCalls.map((c) => c.symbol)).toEqual(["MU.US"]);
    errSpy.mockRestore();
  });
});

describe("aiScheduler resume follow", () => {
  const heartbeatDue = (lastRunAt: number | null, now: number) =>
    lastRunAt == null || now - lastRunAt >= 5 * 60_000;

  it("immediately runs a heartbeat when the last successful follow-up is expired", async () => {
    const now = 1_000_000;
    const { deps, rec } = harness({
      now: () => now,
      latestCommentatorRunAt: async () => now - 5 * 60_000,
      shouldHeartbeat: heartbeatDue,
    });

    await expect(createAiScheduler(deps).resumeFollow("MU.US")).resolves.toBe(true);
    expect(rec.commentatorCalls).toHaveLength(1);
    expect(rec.commentatorCalls[0].trigger.kind).toBe("heartbeat");
    expect(rec.commentatorCalls[0].trigger.detail).toContain("重新开启 AI 跟进");
  });

  it("does not duplicate a follow-up while the last successful run is still fresh", async () => {
    const now = 1_000_000;
    const buildCommentPack = vi.fn(async (symbol: string) => makePack(symbol));
    const { deps, rec } = harness({
      now: () => now,
      latestCommentatorRunAt: async () => now - 5 * 60_000 + 1,
      shouldHeartbeat: heartbeatDue,
      buildCommentPack,
    });

    await expect(createAiScheduler(deps).resumeFollow("MU.US")).resolves.toBe(false);
    expect(buildCommentPack).not.toHaveBeenCalled();
    expect(rec.commentatorCalls).toHaveLength(0);
  });
});

describe("aiScheduler pre-market", () => {
  function gapPack(symbol: string, last: number, prevClose: number | null): CommentPack {
    return makePack(symbol, {
      quote: { last } as CommentPack["quote"],
      day_levels: {
        prev_day: prevClose == null ? null : { high: prevClose + 2, low: prevClose - 2, close: prevClose },
        pre_market: { high: last + 0.5, low: last - 0.5 },
        opening_range: null,
      },
    });
  }

  it("appends a system gap comment for a >=2% gap and dedupes within the day", async () => {
    const { deps, rec } = harness({
      sessionKind: () => "pre",
      buildCommentPack: async (symbol) => gapPack(symbol, 102.5, 100),
    });
    const scheduler = createAiScheduler(deps);
    await scheduler.tick();
    expect(rec.comments).toHaveLength(1);
    expect(rec.comments[0].trigger).toBe("premarket_gap");
    expect(rec.comments[0].level).toBe("info");
    expect(rec.comments[0].source).toBe("system");
    expect(rec.comments[0].text).toContain("高开");
    expect(rec.commentatorCalls).toHaveLength(0);
  });

  it("uses warn level for a >=3% gap", async () => {
    const { deps, rec } = harness({
      sessionKind: () => "pre",
      buildCommentPack: async (symbol) => gapPack(symbol, 96, 100),
    });
    await createAiScheduler(deps).tick();
    expect(rec.comments[0].level).toBe("warn");
    expect(rec.comments[0].text).toContain("低开");
  });

  it("stays quiet below the gap threshold or without a prior close", async () => {
    const small = harness({ sessionKind: () => "pre", buildCommentPack: async (s) => gapPack(s, 101, 100) });
    await createAiScheduler(small.deps).tick();
    expect(small.rec.comments).toHaveLength(0);

    const noPrev = harness({ sessionKind: () => "pre", buildCommentPack: async (s) => gapPack(s, 105, null) });
    await createAiScheduler(noPrev.deps).tick();
    expect(noPrev.rec.comments).toHaveLength(0);
  });

  it("throttles pre-market ticks to the 5-minute cadence", async () => {
    let nowMs = 1_000_000;
    const discoverPreTargets = vi.fn(async () => ["MU.US"]);
    const { deps } = harness({
      sessionKind: () => "pre",
      now: () => nowMs,
      discoverPreTargets,
      buildCommentPack: async (s) => gapPack(s, 101, 100),
    });
    const scheduler = createAiScheduler(deps);
    await scheduler.tick();
    nowMs += 60_000;
    await scheduler.tick();
    expect(discoverPreTargets).toHaveBeenCalledTimes(1);
    nowMs += 5 * 60_000;
    await scheduler.tick();
    expect(discoverPreTargets).toHaveBeenCalledTimes(2);
  });

  it("does not re-append when a premarket_gap comment already exists", async () => {
    const existing: CockpitComment = {
      ts: "2026-07-05T12:00:00.000Z",
      symbol: "MU.US",
      level: "info",
      text: "已有跳空提示",
      trigger: "premarket_gap",
      source: "system",
    };
    const { deps, rec } = harness({
      sessionKind: () => "pre",
      buildCommentPack: async (symbol) =>
        makePack(symbol, {
          quote: { last: 105 } as CommentPack["quote"],
          day_levels: { prev_day: { high: 102, low: 98, close: 100 }, pre_market: null, opening_range: null },
          recent_comments: [existing],
        }),
    });
    await createAiScheduler(deps).tick();
    expect(rec.comments).toHaveLength(0);
  });
});

describe("aiScheduler post-session recap", () => {
  it("runs the recap once per date", async () => {
    let nowMs = 1_000_000;
    const { deps, rec } = harness({ sessionKind: () => "post", now: () => nowMs });
    const scheduler = createAiScheduler(deps);
    await scheduler.tick();
    expect(rec.recaps).toHaveLength(1);
    nowMs += 60_000;
    await scheduler.tick();
    expect(rec.recaps).toHaveLength(1);
  });

  it("swallows a recap failure", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps } = harness({
      sessionKind: () => "post",
      runRecap: async () => {
        throw new Error("recap boom");
      },
    });
    await expect(createAiScheduler(deps).tick()).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe("aiScheduler loop", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("skips a timer fire that lands while the previous tick is still running", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let discoverCalls = 0;
    const { deps } = harness({
      discoverTargets: async () => {
        discoverCalls++;
        await gate;
        return [];
      },
    });
    const scheduler = createAiScheduler(deps);
    scheduler.start();

    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(discoverCalls).toBe(1);

    release!();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();
  });

  it("starts even when the comment model is unresolved", () => {
    const { deps } = harness({
      aiConfig: () => ({ commentModel: null, analystModel: null, deepDiveModel: null, chatModel: null }),
    });
    const scheduler = createAiScheduler(deps);
    expect(scheduler.start()).toBe(true);
    scheduler.stop();
  });

  it("picks up a comment model enabled after start without a restart", async () => {
    let commentModel: AiModel | null = null;
    const discoverTargets = vi.fn(async () => ["MU.US"]);
    const { deps, rec } = harness({
      aiConfig: () => ({ commentModel, analystModel: null, deepDiveModel: null, chatModel: null }),
      discoverTargets,
      detectTriggers: () => [{ kind: "macd_cross", detail: "x" }],
    });
    const scheduler = createAiScheduler(deps);
    expect(scheduler.start()).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(discoverTargets).not.toHaveBeenCalled();
    expect(rec.commentatorCalls).toHaveLength(0);

    commentModel = fakeModel;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(discoverTargets).toHaveBeenCalledTimes(1);
    expect(rec.commentatorCalls.map((c) => c.symbol)).toEqual(["MU.US"]);

    scheduler.stop();
  });

  it("stops firing after stop", async () => {
    const discoverTargets = vi.fn(async () => []);
    const { deps } = harness({ discoverTargets });
    const scheduler = createAiScheduler(deps);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(discoverTargets).toHaveBeenCalledTimes(1);
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(discoverTargets).toHaveBeenCalledTimes(1);
  });
});

function chartMeta(symbol: string, createdAt: string): ChartMeta {
  return {
    id: `${symbol}-${createdAt}`,
    schema_version: 1,
    type: "intraday",
    title: symbol,
    symbol,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

describe("discoverIntradayTargets persistent follow filtering", () => {
  it("monitors a followed symbol even when its latest chart is from an earlier date", async () => {
    store.listCharts.mockResolvedValue([chartMeta("MU.US", "2026-06-20T15:00:00Z")]);
    follows.listFollowedSymbols.mockReturnValue(["MU.US"]);
    expect(await discoverIntradayTargets()).toEqual(["MU.US"]);
  });

  it("excludes a chart whose symbol is not followed", async () => {
    store.listCharts.mockResolvedValue([chartMeta("MU.US", "2026-07-02T15:00:00Z")]);
    expect(await discoverIntradayTargets()).toEqual([]);
  });

  it("excludes a followed symbol that has no intraday chart", async () => {
    store.listCharts.mockResolvedValue([]);
    follows.listFollowedSymbols.mockReturnValue(["MU.US"]);
    expect(await discoverIntradayTargets()).toEqual([]);
  });

  it("normalizes and deduplicates persisted symbols", async () => {
    store.listCharts.mockResolvedValue([chartMeta("MU.US", "2026-07-02T15:00:00Z")]);
    follows.listFollowedSymbols.mockReturnValue(["mu.us", "MU.US"]);
    expect(await discoverIntradayTargets()).toEqual(["MU.US"]);
  });
});

describe("aiScheduler persistent follow wiring", () => {
  it("regular tick invokes the commentator for a persistently followed symbol", async () => {
    const { deps, rec } = harness({
      discoverTargets: () => discoverIntradayTargets(),
      detectTriggers: () => [{ kind: "macd_cross", detail: "x" }],
    });
    store.listCharts.mockResolvedValue([chartMeta("MU.US", "2026-07-02T15:00:00Z")]);
    follows.listFollowedSymbols.mockReturnValue(["MU.US"]);
    await createAiScheduler(deps).tick();
    expect(rec.commentatorCalls.map((c) => c.symbol)).toEqual(["MU.US"]);
  });

  it("pre-market tick remains quiet after persistent following is stopped", async () => {
    const { deps, rec } = harness({
      sessionKind: () => "pre",
      now: () => 1_000_000,
      discoverPreTargets: () => discoverIntradayTargets(),
      buildCommentPack: async (symbol) =>
        makePack(symbol, {
          quote: { last: 105 } as CommentPack["quote"],
          day_levels: { prev_day: { high: 102, low: 98, close: 100 }, pre_market: null, opening_range: null },
        }),
    });
    store.listCharts.mockResolvedValue([chartMeta("MU.US", "1970-01-01T00:00:00.000Z")]);
    await createAiScheduler(deps).tick();
    expect(rec.comments).toHaveLength(0);
  });

  it("post-market recap still runs with no followed symbols", async () => {
    const { deps, rec } = harness({ sessionKind: () => "post", now: () => 1_000_000 });
    await createAiScheduler(deps).tick();
    expect(rec.recaps).toHaveLength(1);
  });
});
