import type { AiRoles, Catalog } from "../settings/types";
import type { ChatUsage } from "../cockpit/chat/useChatSession";

export function resolveChatModelName(roles: AiRoles, catalog: Catalog): string | null {
  const chatRole = roles.chat;
  const effective = chatRole.mode === "inherit" ? roles.primary : chatRole;
  if (effective.mode !== "custom" || !effective.provider || !effective.modelId) return null;
  const provider = catalog.providers.find((entry) => entry.id === effective.provider);
  const model = provider?.models.find((entry) => entry.id === effective.modelId);
  return model?.name ?? null;
}

export function formatUsageLine(modelName: string | null, usage: ChatUsage | null): string | null {
  if (!usage || usage.calls === 0) return null;
  const model = modelName ?? "未知模型";
  return `${model} · 本会话 ${usage.totalTokens} tokens · $${usage.costTotal.toFixed(2)}`;
}
