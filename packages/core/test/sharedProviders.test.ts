import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";
import { MessagesEngine } from "../src/ai/messages/messageEngine.js";
import { RunMetadataProvider } from "../src/ai/messages/sharedProviders.js";

const textOf = (message: AgentMessage): string => {
  if (message.role !== "user") return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
};

describe("RunMetadataProvider", () => {
  it("omits market_date/data_as_of when absent and defaults origin to manual", async () => {
    const engine = new MessagesEngine([
      new RunMetadataProvider({
        agent: "deep-dive",
        symbol: "MU.US",
        startedAt: "2026-07-14T14:00:00.000Z",
      }),
    ]);
    const raw: AgentMessage[] = [{ role: "user", content: "分析", timestamp: 1 }];

    const result = await engine.process(raw);
    const rendered = textOf(result.messages[0]);

    expect(rendered).toContain("<agent>deep-dive</agent>");
    expect(rendered).toContain("<origin>manual</origin>");
    expect(rendered).not.toContain("<market_date>");
    expect(rendered).not.toContain("<data_as_of>");
  });
});
