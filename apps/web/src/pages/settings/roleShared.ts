import { client } from "@web/client";
import {
  CODEX_PROVIDER,
  type Catalog,
  type CatalogProvider,
  type CredentialEntry,
  type RoleSetting,
} from "./types";

export const DEFAULT_CODEX_MODEL_ID = "gpt-5.6-luna";

export function firstModelId(catalog: Catalog, providerId: string): string | null {
  const provider = catalog.providers.find((item) => item.id === providerId);
  if (!provider) return null;
  if (
    providerId === CODEX_PROVIDER &&
    provider.models.some((model) => model.id === DEFAULT_CODEX_MODEL_ID)
  ) {
    return DEFAULT_CODEX_MODEL_ID;
  }
  return provider.models[0]?.id ?? null;
}

export function defaultThinkingLevel(
  catalog: Catalog,
  providerId: string,
  modelId: string | null,
): string {
  if (!modelId) return "off";
  return (
    catalog.providers
      .find((provider) => provider.id === providerId)
      ?.models.find((model) => model.id === modelId)
      ?.thinkingLevels[0] ?? "off"
  );
}

export function selectableProviders(catalog: Catalog, currentId?: string | null): CatalogProvider[] {
  return catalog.providers.filter((p) => p.auth.status === "configured" || p.id === currentId);
}

export function providerLabel(catalog: Catalog, providerId: string): string {
  const provider = catalog.providers.find((p) => p.id === providerId);
  if (!provider) return providerId;
  return provider.auth.status === "configured" ? provider.name : `${provider.name}（未认证）`;
}

export function providerKeyReady(providerId: string, credentials: CredentialEntry[], catalog: Catalog): boolean {
  const provider = catalog.providers.find((item) => item.id === providerId);
  if (providerId === CODEX_PROVIDER || provider?.auth.kind === "oauth") {
    return provider?.auth.status === "configured";
  }
  return credentials.some((c) => c.provider === providerId && c.ok);
}

export function defaultCustom(catalog: Catalog): RoleSetting {
  const provider = selectableProviders(catalog)[0]?.id ?? null;
  const modelId = provider ? firstModelId(catalog, provider) : null;
  const thinkingLevel = provider ? defaultThinkingLevel(catalog, provider, modelId) : "off";
  return { mode: "custom", provider, modelId, thinkingLevel, stale: false };
}

type RoleSettingResponse = Omit<RoleSetting, "stale">;

export async function saveRole(role: string, setting: RoleSetting): Promise<RoleSetting> {
  if (setting.mode === "disabled") {
    await client.settings.deleteRole({ role });
    return { mode: "disabled", provider: null, modelId: null, thinkingLevel: null, stale: false };
  }
  if (setting.mode === "inherit") {
    const res: RoleSettingResponse = await client.settings.putRole({ role, mode: "inherit" });
    return { ...res, stale: false };
  }
  const res: RoleSettingResponse = await client.settings.putRole({
    role,
    mode: "custom",
    provider: setting.provider,
    modelId: setting.modelId,
    thinkingLevel: setting.thinkingLevel,
  });
  return { ...res, stale: false };
}
