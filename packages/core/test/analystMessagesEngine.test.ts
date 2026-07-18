import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";
import {
  AnalystMessagesEngine,
  type AnalystStepContext,
} from "../src/ai/messages/analystMessagesEngine.js";
import type { ReassessPack } from "../src/ai/datapack.js";

const pack: ReassessPack = {
  symbol: "MU.US",
  as_of: "2026-07-14T14:00:00.000Z",
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
};

const textOf = (message: AgentMessage): string => {
  if (message.role !== "user") return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
};

describe("AnalystMessagesEngine", () => {
  it("builds an ephemeral model view without mutating or accumulating on the raw transcript", async () => {
    const step: AnalystStepContext = {
      chartId: null,
      journalWritten: false,
      loadedSkillIds: [],
      submitted: false,
    };
    const engine = new AnalystMessagesEngine({
      initialContext: {
        dataPack: pack,
        marketDate: "2026-07-14",
        origin: "manual",
        runtimeAdapter: "RUNTIME ADAPTER",
        skills: [
          {
            activated: true,
            content: "INTRADAY BODY",
            description: "短线多周期分析",
            name: "intraday-signal",
          },
          {
            activated: false,
            description: "需要读取 X 时使用",
            name: "twitter-reader",
          },
        ],
        startedAt: "2026-07-14T14:00:00.000Z",
        symbol: "MU.US",
      },
      stepContext: () => step,
    });
    const raw: AgentMessage[] = [
      { role: "user", content: "请重估 MU.US。", timestamp: 1 },
    ];

    const first = await engine.process(raw);
    const second = await engine.process(raw);

    expect(raw).toEqual([{ role: "user", content: "请重估 MU.US。", timestamp: 1 }]);
    expect(first.messages).toHaveLength(3);
    expect(second.messages).toHaveLength(3);
    expect(
      textOf(first.messages[0]).match(/SYSTEM CONTEXT \(NOT PART OF USER QUERY\)/g),
    ).toHaveLength(1);
    expect(textOf(first.messages[0])).toContain("twitter-reader");
    expect(textOf(first.messages[0])).toContain("INTRADAY BODY");
    expect(textOf(first.messages[0])).toContain('"symbol":"MU.US"');
    expect(textOf(first.messages[1])).toBe("请重估 MU.US。");
    expect(textOf(first.messages[2])).toContain("<analyst_run_state>");
  });

  it("recomputes high-churn run state at the tail without persisting the old value", async () => {
    const step: AnalystStepContext = {
      chartId: null,
      journalWritten: false,
      loadedSkillIds: [],
      submitted: false,
    };
    const engine = new AnalystMessagesEngine({
      initialContext: {
        dataPack: pack,
        marketDate: "2026-07-14",
        runtimeAdapter: "RUNTIME ADAPTER",
        skills: [],
        startedAt: "2026-07-14T14:00:00.000Z",
        symbol: "MU.US",
      },
      stepContext: () => step,
    });
    const raw: AgentMessage[] = [{ role: "user", content: "分析", timestamp: 1 }];

    const before = await engine.process(raw);
    step.journalWritten = true;
    step.loadedSkillIds = ["twitter-reader"];
    step.marketDate = "2026-07-15";
    step.dataAsOf = "2026-07-15T15:30:00.000Z";
    const after = await engine.process(raw);

    expect(textOf(before.messages.at(-1)!)).toContain("<journal_written>false</journal_written>");
    expect(textOf(after.messages.at(-1)!)).toContain("<journal_written>true</journal_written>");
    expect(textOf(after.messages.at(-1)!)).toContain("twitter-reader");
    expect(textOf(after.messages.at(-1)!)).toContain("<market_date>2026-07-15</market_date>");
    expect(textOf(after.messages.at(-1)!)).toContain("<data_as_of>2026-07-15T15:30:00.000Z</data_as_of>");
    expect(textOf(after.messages.at(-1)!)).not.toContain("<journal_written>false</journal_written>");
    expect(raw).toEqual([{ role: "user", content: "分析", timestamp: 1 }]);
  });
});
