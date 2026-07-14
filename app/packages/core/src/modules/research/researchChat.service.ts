import { abortResearchChatTurn, type ResearchChatDeps, researchChatTurnState, runResearchChatTurn } from "../../ai/researchChat.js";
import { getResearchSessionByPath, listResearchMessages } from "../../ai/researchChatStore.js";
import { toDisplayMessages } from "../../ai/chat.js";
import { aiConfig } from "../../ai/models.js";
import type { ResearchApi } from "../../contract/research.js";
import { ClientError } from "../../errors.js";
import { researchService } from "./research.service.js";

const MAX_TEXT_LENGTH = 4_000;
type ResearchChatApi = Pick<ResearchApi, "getChat" | "postMessage" | "abortChat" | "suggestions">;

let testDeps: ResearchChatDeps | null = null;

export function setResearchChatDepsForTests(deps: ResearchChatDeps | null): void {
  testDeps = deps;
}

function buildDeps(): ResearchChatDeps {
  return testDeps ?? { model: aiConfig().chatModel };
}

export const researchChatService: ResearchChatApi = {
  async getChat(input) {
    await researchService.get({ path: input.path });
    const session = await getResearchSessionByPath(input.path, testDeps?.db);
    const messages = session ? toDisplayMessages(await listResearchMessages(session.id, testDeps?.db)) : [];
    const { busy, partial } = researchChatTurnState(input.path);
    return { session, messages, busy, partial };
  },

  async postMessage(input) {
    if (!input.text.trim() || input.text.length > MAX_TEXT_LENGTH) {
      throw new ClientError("`text` must be a non-empty string of at most 4000 characters", '{"text":"..."}');
    }
    const result = await runResearchChatTurn(input.path, input.text, buildDeps());
    if (result.started) {
      result.done.catch((error) => console.error("research chat: turn failed", error));
      return { status: 202, body: { accepted: true } };
    }
    if (result.reason === "busy") return { status: 409, body: { error: "上一条还在回答中" } };
    return { status: 503, body: { error: "未配置追问模型，请在 /settings 配置" } };
  },

  async abortChat(input) {
    await researchService.get({ path: input.path });
    if (!abortResearchChatTurn(input.path)) {
      return { status: 409, body: { error: "当前没有正在生成的回答" } };
    }
    return { status: 202, body: { aborted: true } };
  },

  async suggestions(input) {
    const document = await researchService.get({ path: input.path });
    return {
      suggestions:
        document.kind === "journal"
          ? ["总结这份记录的核心判断", "找出证据不足或过期的结论", "追加一段后续验证计划"]
          : ["总结当前投资论点", "找出需要继续验证的风险", "根据现有内容提出增量修改"],
    };
  },
};
