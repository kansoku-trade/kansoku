import { describe, expect, it } from "vitest";
import type { CockpitComment } from "../../shared/types.js";
import {
  type AgentFactory,
  type CommentatorAgent,
  runCommentator,
} from "../src/ai/commentator.js";
import type { CommentPack } from "../src/ai/datapack.js";
import type { AiModel } from "../src/ai/models.js";
import type { Trigger } from "../src/ai/triggers.js";

const fakeModel = { provider: "anthropic", id: "claude-haiku-4-5" } as unknown as AiModel;
const trigger: Trigger = { kind: "macd_cross", detail: "hist 0.1 -> -0.1" };

function makePack(symbol: string): CommentPack {
  return {
    symbol,
    as_of: "2026-07-05T15:00:00.000Z",
    quote: {} as CommentPack["quote"],
    m5: { bars: [], macd: { dif: [], dea: [], hist: [] } },
    flow: [],
    prediction: null,
    recent_comments: [],
  };
}

interface Harness {
  deps: {
    model: AiModel;
    agentFactory: AgentFactory;
    appendComment: (c: CockpitComment) => Promise<void>;
    timeoutMs?: number;
  };
  comments: CockpitComment[];
}

function harness(
  build: (
    tools: Parameters<AgentFactory>[0]["tools"],
    record: (escalate: boolean) => Promise<void>,
  ) => CommentatorAgent,
  timeoutMs?: number,
): Harness {
  const comments: CockpitComment[] = [];
  const appendComment = async (c: CockpitComment) => {
    comments.push(c);
  };
  const agentFactory: AgentFactory = ({ tools }) => {
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
    const { deps, comments } = harness(() => ({
      prompt: async () => {},
      abort: () => {},
    }));
    const result = await runCommentator({ symbol: "MU.US", pack: makePack("MU.US"), trigger, deps });
    expect(result).toEqual({ escalate: false });
    expect(comments).toHaveLength(1);
    expect(comments[0].level).toBe("error");
    expect(comments[0].source).toBe("system");
    expect(comments[0].trigger).toBe("macd_cross: hist 0.1 -> -0.1");
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
    let capturedSubmit: Parameters<AgentFactory>[0]["tools"][number] | undefined;
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
