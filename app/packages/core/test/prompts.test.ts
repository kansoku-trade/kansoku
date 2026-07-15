import { describe, expect, it } from "vitest";
import type { ChartDoc } from "../../../shared/types.js";
import { buildAnalystSystemPrompt } from "../src/ai/analyst.js";
import { buildChatSystemPrompt } from "../src/ai/chat.js";
import {
  ANALYST_ADAPTER_PROMPT,
  ANALYST_RETRY_PROMPT,
  CHAT_DIALOG_RULES,
  CHAT_GATED_RETRY_INSTRUCTION,
  CHAT_GATED_TURN_INSTRUCTION,
  CHAT_SUGGESTIONS_PROMPT,
  COMMENTATOR_PROMPT,
  COMMENTATOR_RETRY_PROMPT,
  deepDiveAdapterPrompt,
  EVENT_FILTER_PROMPT,
} from "../src/ai/prompts.js";
import { composeWithDiscipline, OBSERVER_CONTRACT } from "../src/ai/promptPolicy.js";

const DISCIPLINE = "<TRADING-DISCIPLINE>";

function fakeDoc(): ChartDoc {
  return {
    id: "chart-1",
    schema_version: 2,
    type: "intraday",
    title: "MU 短线",
    symbol: "MU.US",
    created_at: "2026-07-05T14:00:00.000Z",
    updated_at: "2026-07-05T14:00:00.000Z",
    input: { prediction: { direction: "long", comment: "结构完好" } },
    built: { kind: "intraday" } as unknown as ChartDoc["built"],
  };
}

describe("assembled system prompts (drift guard)", () => {
  it("analyst system prompt stays runtime-stable", () => {
    expect(buildAnalystSystemPrompt()).toMatchSnapshot();
  });

  it("deep dive adapter", () => {
    expect(composeWithDiscipline(DISCIPLINE, deepDiveAdapterPrompt())).toMatchSnapshot();
  });

  it("chat = discipline → context → dialog rules", () => {
    expect(
      buildChatSystemPrompt(
        fakeDoc(),
        [{ ts: "2026-07-05T14:05:00.000Z", symbol: "MU.US", level: "info", text: "开盘走强", source: "analyst" }],
        DISCIPLINE,
      ),
    ).toMatchSnapshot();
  });

  it("commentator = observer contract → own rules", () => {
    expect(composeWithDiscipline(OBSERVER_CONTRACT, COMMENTATOR_PROMPT)).toMatchSnapshot();
  });

  it("mechanical and per-turn prompts", () => {
    expect({
      chatSuggestions: CHAT_SUGGESTIONS_PROMPT,
      eventFilter: EVENT_FILTER_PROMPT,
      analystRetry: ANALYST_RETRY_PROMPT,
      commentatorRetry: COMMENTATOR_RETRY_PROMPT,
      chatGatedTurn: CHAT_GATED_TURN_INSTRUCTION,
      chatGatedRetry: CHAT_GATED_RETRY_INSTRUCTION,
    }).toMatchSnapshot();
  });
});

describe("no restated discipline prose in agent-own prompts", () => {
  const judgmentOwnProse = [ANALYST_ADAPTER_PROMPT, deepDiveAdapterPrompt(), CHAT_DIALOG_RULES, CHAT_GATED_TURN_INSTRUCTION];

  it("cites TD rule IDs instead of copying rule bodies", () => {
    for (const prose of judgmentOwnProse) {
      expect(prose).not.toContain("supported / partial / contradicted");
      expect(prose).not.toContain("只做美股");
      expect(prose).not.toContain("不要臆造数据");
    }
  });
});
