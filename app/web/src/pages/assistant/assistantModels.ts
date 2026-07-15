import type { AiRoles, Catalog, RoleSetting } from "../settings/types";

export interface AssistantModelChoice {
  value: string;
  label: string;
  provider: string;
  modelId: string;
  thinkingLevel: string;
}

export function assistantModelValue(provider: string, modelId: string): string {
  return JSON.stringify([provider, modelId]);
}

export function buildAssistantModelChoices(catalog: Catalog): AssistantModelChoice[] {
  return catalog.providers.flatMap((provider) => {
    if (provider.auth.status !== "configured") return [];
    return provider.models.map((model) => ({
      value: assistantModelValue(provider.id, model.id),
      label: `${model.name} · ${provider.name}`,
      provider: provider.id,
      modelId: model.id,
      thinkingLevel: model.thinkingLevels[0] ?? "off",
    }));
  });
}

export function resolveAssistantModelValue(roles: AiRoles): string {
  const chat = roles.chat.mode === "inherit" ? roles.primary : roles.chat;
  if (chat.mode !== "custom" || !chat.provider || !chat.modelId) return "";
  return assistantModelValue(chat.provider, chat.modelId);
}

export function assistantModelLabels(catalog: Catalog): Record<string, string> {
  return Object.fromEntries(
    catalog.providers.flatMap((provider) =>
      provider.models.map((model) => [assistantModelValue(provider.id, model.id), model.name]),
    ),
  );
}

export function roleSettingForAssistantModel(choice: AssistantModelChoice): RoleSetting {
  return {
    mode: "custom",
    provider: choice.provider,
    modelId: choice.modelId,
    thinkingLevel: choice.thinkingLevel,
    stale: false,
  };
}
