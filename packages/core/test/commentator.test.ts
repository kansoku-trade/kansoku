import { beforeEach, describe, expect, it } from "vitest";
import type { CockpitComment, RawBar } from "../../shared/types.js";
import type { AiAgentFactory, AiAgentHandle } from "../src/ai/agentSession.js";
import {
  type CommentatorDeps,
  resetCommentatorSessions,
  runCommentator,
} from "../src/ai/commentator.js";
import type { CommentPack } from "../src/ai/datapack.js";
import type { AiModel } from "../src/ai/models.js";
import type { Trigger } from "../src/ai/triggers.js";

const fakeModel = { provider: "anthropic", id: "claude-haiku-4-5" } as unknown as AiModel;
const trigger: Trigger = { kind: "macd_cross", detail: "hist 0.1 -> -0.1" };

beforeEach(() => {
  resetCommentatorSessions();
});

function bar(time: string): RawBar {
  return { time, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 };
}

function makePack(symbol: string, bars: RawBar[] = []): CommentPack {
  return {
    symbol,
    as_of: "2026-07-05T15:00:00.000Z",
    quote: {} as CommentPack["quote"],
    m5: { bars, macd: { dif: bars.map(() => 0), dea: bars.map(() => 0), hist: bars.map(() => 0) } },
    flow: [],
    prediction: null,
    recent_comments: [],
    day_levels: { prev_day: null, pre_market: null, opening_range: null },
    rel_volume: null,
  };
}

interface Harness {
  deps: {
    model: AiModel;
    agentFactory: AiAgentFactory;
    appendComment: (c: CockpitComment) => Promise<void>;
    timeoutMs?: number;
  };
  comments: CockpitComment[];
}

function harness(
  build: (
    tools: Parameters<AiAgentFactory>[0]["tools"],
    record: (escalate: boolean) => Promise<void>,
  ) => AiAgentHandle,
  timeoutMs?: number,
): Harness {
  const comments: CockpitComment[] = [];
  const appendComment = async (c: CockpitComment) => {
    comments.push(c);
  };
  const agentFactory: AiAgentFactory = ({ tools }) => {
    const submit = tools.find((t) => t.name === "submit_comment");
    const record = async (escalate: boolean) => {
      await submit?.execute("call-1", { level: "warn", text: "两句话点评", escalate });
    };
    return build(tools, record);
  };
  return { deps: { model: fakeModel, agentFactory, appendComment, timeoutMs }, comments };
}

describe("runCommentator", () => {
  it("persists the comment when the agent calls submit_comment and returns escalate", async () => {
    const { deps, comments } = harness((_tools, record) => ({
      prompt: async () => {
        await record(true);
      },
      abort: () => {},
    }));

    const result = await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });

    expect(result).toEqual({ escalate: true });
    expect(comments).toHaveLength(1);
    const c = comments[0];
    expect(c.symbol).toBe("MU.US");
    expect(c.source).toBe("commentator");
    expect(c.level).toBe("warn");
    expect(c.text).toBe("两句话点评");
    expect(c.trigger).toBe("macd_cross: hist 0.1 -> -0.1");
    expect(c.escalated).toBe(true);
    expect(typeof c.ts).toBe("string");
  });

  it("returns escalate:false when the tool reports no escalation", async () => {
    const { deps } = harness((_tools, record) => ({
      prompt: async () => {
        await record(false);
      },
      abort: () => {},
    }));
    const result = await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });
    expect(result).toEqual({ escalate: false });
  });

  it("honors the tool terminate hint by returning it from execute", async () => {
    let terminate: boolean | undefined;
    const { deps } = harness((tools) => ({
      prompt: async () => {
        const submit = tools.find((t) => t.name === "submit_comment");
        const res = await submit!.execute("call-1", { level: "info", text: "x", escalate: false });
        terminate = res.terminate;
      },
      abort: () => {},
    }));
    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });
    expect(terminate).toBe(true);
  });

  it("writes a system error comment when the agent never calls the tool", async () => {
    let promptCalls = 0;
    const { deps, comments } = harness(() => ({
      prompt: async () => {
        promptCalls += 1;
      },
      abort: () => {},
    }));
    const result = await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });
    expect(result).toEqual({ escalate: false });
    expect(promptCalls).toBe(2);
    expect(comments).toHaveLength(1);
    expect(comments[0].level).toBe("error");
    expect(comments[0].source).toBe("system");
    expect(comments[0].trigger).toBe("macd_cross: hist 0.1 -> -0.1");
  });

  it("recovers when the agent submits only after the retry nudge", async () => {
    const prompts: string[] = [];
    const { deps, comments } = harness((_tools, record) => ({
      prompt: async (text: string) => {
        prompts.push(text);
        if (prompts.length === 2) await record(false);
      },
      abort: () => {},
    }));
    const result = await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });
    expect(result).toEqual({ escalate: false });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("submit_comment");
    expect(comments).toHaveLength(1);
    expect(comments[0].source).toBe("commentator");
  });

  it("keeps the session alive after a retry-rescued run", async () => {
    let factoryCalls = 0;
    let silentOnce = true;
    const agentFactory: AiAgentFactory = ({ tools }) => {
      factoryCalls += 1;
      let currentTools = tools;
      let calls = 0;
      return {
        prompt: async () => {
          calls += 1;
          if (silentOnce && calls === 1) return;
          silentOnce = false;
          await currentTools.find((t) => t.name === "submit_comment")?.execute("c", { level: "info", text: "x", escalate: false });
        },
        abort: () => {},
        setTools: (tools) => {
          currentTools = tools;
        },
      };
    };
    const deps: CommentatorDeps = { model: fakeModel, agentFactory, appendComment: async () => {} };

    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });
    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });
    expect(factoryCalls).toBe(1);
  });

  it("writes a system error comment when the agent throws", async () => {
    const { deps, comments } = harness(() => ({
      prompt: async () => {
        throw new Error("model exploded");
      },
      abort: () => {},
    }));
    const result = await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });
    expect(result).toEqual({ escalate: false });
    expect(comments).toHaveLength(1);
    expect(comments[0].level).toBe("error");
    expect(comments[0].source).toBe("system");
    expect(comments[0].text).toContain("model exploded");
  });

  it("aborts and writes an error comment when the agent hangs past the timeout", async () => {
    let aborted = false;
    const { deps, comments } = harness(
      () => ({
        prompt: () => new Promise<void>(() => {}),
        abort: () => {
          aborted = true;
        },
      }),
      10,
    );
    const result = await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });
    expect(result).toEqual({ escalate: false });
    expect(aborted).toBe(true);
    expect(comments).toHaveLength(1);
    expect(comments[0].level).toBe("error");
    expect(comments[0].source).toBe("system");
    expect(comments[0].text).toContain("超时");
  });

  it("does not append a second comment when a late submit runs after the timeout", async () => {
    let capturedSubmit: Parameters<AiAgentFactory>[0]["tools"][number] | undefined;
    const { deps, comments } = harness((tools) => {
      capturedSubmit = tools.find((t) => t.name === "submit_comment");
      return {
        prompt: () => new Promise<void>(() => {}),
        abort: () => {},
      };
    }, 10);

    const result = await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });
    expect(result).toEqual({ escalate: false });
    expect(comments).toHaveLength(1);
    expect(comments[0].source).toBe("system");

    const late = await capturedSubmit!.execute("call-late", {
      level: "info",
      text: "迟到的点评",
      escalate: false,
    });
    expect(late.terminate).toBe(true);
    expect(comments).toHaveLength(1);
    expect(comments[0].source).toBe("system");
  });

  it("reuses the session agent within a day and sends incremental updates", async () => {
    const prompts: string[] = [];
    const submittedTriggers: string[] = [];
    let factoryCalls = 0;
    const appendComment = async (c: CockpitComment) => {
      if (c.source === "commentator") submittedTriggers.push(c.trigger ?? "");
    };
    const agentFactory: AiAgentFactory = ({ tools }) => {
      factoryCalls += 1;
      let currentTools = tools;
      return {
        prompt: async (text: string) => {
          prompts.push(text);
          const submit = currentTools.find((t) => t.name === "submit_comment");
          await submit?.execute("call", { level: "info", text: "点评", escalate: false });
        },
        abort: () => {},
        setTools: (tools) => {
          currentTools = tools;
        },
      };
    };
    const deps: CommentatorDeps = { model: fakeModel, agentFactory, appendComment };

    const bars1 = [bar("2026-07-05T14:50:00.000Z"), bar("2026-07-05T14:55:00.000Z")];
    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US", bars1), trigger, deps });

    const bars2 = [...bars1, bar("2026-07-05T15:00:00.000Z")];
    const trigger2: Trigger = { kind: "level_break", detail: "破位" };
    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US", bars2), trigger: trigger2, deps });

    expect(factoryCalls).toBe(1);
    expect(prompts).toHaveLength(2);
    const first = JSON.parse(prompts[0]);
    expect(first).toHaveProperty("pack");
    const second = JSON.parse(prompts[1]);
    expect(second).not.toHaveProperty("pack");
    expect(second.update.m5.bars.map((b: RawBar) => b.time)).toEqual(["2026-07-05T15:00:00.000Z"]);
    // the swapped-in tool must carry the new trigger
    expect(submittedTriggers).toEqual(["macd_cross: hist 0.1 -> -0.1", "level_break: 破位"]);
  });

  it("reseeds a fresh session when the trading day changes", async () => {
    let factoryCalls = 0;
    const agentFactory: AiAgentFactory = ({ tools }) => {
      factoryCalls += 1;
      return {
        prompt: async () => {
          await tools.find((t) => t.name === "submit_comment")?.execute("c", { level: "info", text: "x", escalate: false });
        },
        abort: () => {},
      };
    };
    const appendComment = async () => {};
    const day1 = () => new Date("2026-07-05T15:00:00.000Z");
    const day2 = () => new Date("2026-07-06T15:00:00.000Z");
    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps: { model: fakeModel, agentFactory, appendComment, now: day1 } });
    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps: { model: fakeModel, agentFactory, appendComment, now: day2 } });
    expect(factoryCalls).toBe(2);
  });

  it("reseeds a fresh session when the model changes", async () => {
    let factoryCalls = 0;
    const agentFactory: AiAgentFactory = ({ tools }) => {
      factoryCalls += 1;
      return {
        prompt: async () => {
          await tools.find((t) => t.name === "submit_comment")?.execute("c", { level: "info", text: "x", escalate: false });
        },
        abort: () => {},
      };
    };
    const appendComment = async () => {};
    const otherModel = { provider: "anthropic", id: "claude-sonnet-5" } as unknown as AiModel;
    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps: { model: fakeModel, agentFactory, appendComment } });
    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps: { model: otherModel, agentFactory, appendComment } });
    expect(factoryCalls).toBe(2);
  });

  it("reseeds a fresh session when only thinkingLevel changes", async () => {
    let factoryCalls = 0;
    const agentFactory: AiAgentFactory = ({ tools }) => {
      factoryCalls += 1;
      return {
        prompt: async () => {
          await tools.find((t) => t.name === "submit_comment")?.execute("c", { level: "info", text: "x", escalate: false });
        },
        abort: () => {},
      };
    };
    const appendComment = async () => {};
    const lowModel = { provider: "anthropic", id: "claude-haiku-4-5", thinkingLevel: "low" } as unknown as AiModel;
    const highModel = { provider: "anthropic", id: "claude-haiku-4-5", thinkingLevel: "high" } as unknown as AiModel;
    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps: { model: lowModel, agentFactory, appendComment } });
    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps: { model: highModel, agentFactory, appendComment } });
    expect(factoryCalls).toBe(2);
  });

  it("reuses the session when provider/id/thinkingLevel are unchanged", async () => {
    let factoryCalls = 0;
    const agentFactory: AiAgentFactory = ({ tools }) => {
      factoryCalls += 1;
      let currentTools = tools;
      return {
        prompt: async () => {
          await currentTools.find((t) => t.name === "submit_comment")?.execute("c", { level: "info", text: "x", escalate: false });
        },
        abort: () => {},
        setTools: (tools) => {
          currentTools = tools;
        },
      };
    };
    const appendComment = async () => {};
    const model = { provider: "anthropic", id: "claude-haiku-4-5", thinkingLevel: "low" } as unknown as AiModel;
    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps: { model, agentFactory, appendComment } });
    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps: { model, agentFactory, appendComment } });
    expect(factoryCalls).toBe(1);
  });

  it("drops the session after a failed run and reseeds with a full pack", async () => {
    const prompts: string[] = [];
    let factoryCalls = 0;
    let fail = false;
    const agentFactory: AiAgentFactory = ({ tools }) => {
      factoryCalls += 1;
      let currentTools = tools;
      return {
        prompt: async (text: string) => {
          prompts.push(text);
          if (fail) throw new Error("boom");
          await currentTools.find((t) => t.name === "submit_comment")?.execute("c", { level: "info", text: "x", escalate: false });
        },
        abort: () => {},
        setTools: (tools) => {
          currentTools = tools;
        },
      };
    };
    const deps: CommentatorDeps = { model: fakeModel, agentFactory, appendComment: async () => {} };

    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });
    fail = true;
    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });
    fail = false;
    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });

    expect(factoryCalls).toBe(2);
    expect(JSON.parse(prompts[2])).toHaveProperty("pack");
  });

  it("drops the session when the agent never calls submit_comment", async () => {
    let factoryCalls = 0;
    let silent = false;
    const agentFactory: AiAgentFactory = ({ tools }) => {
      factoryCalls += 1;
      let currentTools = tools;
      return {
        prompt: async () => {
          if (silent) return;
          await currentTools.find((t) => t.name === "submit_comment")?.execute("c", { level: "info", text: "x", escalate: false });
        },
        abort: () => {},
        setTools: (tools) => {
          currentTools = tools;
        },
      };
    };
    const deps: CommentatorDeps = { model: fakeModel, agentFactory, appendComment: async () => {} };

    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });
    silent = true;
    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });
    silent = false;
    await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });

    expect(factoryCalls).toBe(2);
  });

  it("recycles the session once the sent-chars budget is exhausted", async () => {
    let factoryCalls = 0;
    const agentFactory: AiAgentFactory = ({ tools }) => {
      factoryCalls += 1;
      let currentTools = tools;
      return {
        prompt: async () => {
          await currentTools.find((t) => t.name === "submit_comment")?.execute("c", { level: "info", text: "x", escalate: false });
        },
        abort: () => {},
        setTools: (tools) => {
          currentTools = tools;
        },
      };
    };
    const deps: CommentatorDeps = { model: fakeModel, agentFactory, appendComment: async () => {} };
    const bigPack = makePack("MU.US");
    // quote is part of both the seed and every incremental update; oversize it
    // so each prompt hits the MAX_PROMPT_CHARS (24k) truncation cap
    bigPack.quote = { note: "x".repeat(30_000) } as unknown as CommentPack["quote"];

    // 5 runs × 24k chars ≥ 120k budget → session recycled, 6th run reseeds
    for (let i = 0; i < 5; i += 1) {
      await runCommentator({ symbol: "MU.US", pack: bigPack, trigger, deps });
    }
    expect(factoryCalls).toBe(1);
    await runCommentator({ symbol: "MU.US", pack: bigPack, trigger, deps });
    expect(factoryCalls).toBe(2);
  });

  it("skips and returns escalate:false when a run for the symbol is already in flight", async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { deps, comments } = harness((_tools, record) => ({
      prompt: async () => {
        await gate;
        await record(false);
      },
      abort: () => {},
    }));

    const first = runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });
    const second = await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });
    expect(second).toEqual({ escalate: false });
    expect(comments).toHaveLength(0);

    release!();
    await first;
    expect(comments).toHaveLength(1);
  });
});
