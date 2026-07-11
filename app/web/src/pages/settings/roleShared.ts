import { client } from "../../client";
import {
  CODEX_PROVIDER,
  type Catalog,
  type CatalogProvider,
  type CredentialEntry,
  type RoleSetting,
} from "./types";

export function firstModelId(catalog: Catalog, providerId: string): string | null {
  return catalog.providers.find((p) => p.id === providerId)?.models[0]?.id ?? null;
}

export function selectableProviders(catalog: Catalog, currentId?: string | null): CatalogProvider[] {
  return catalog.providers.filter((p) => p.auth.status === "configured" || p.id === currentId);
}

export function providerLabel(catalog: Catalog, providerId: string): string {
  const provider = catalog.providers.find((p) => p.id === providerId);
  if (!provider) return providerId;
  return provider.auth.status === "configured" ? provider.name : `${provider.name}（未配 key）`;
}

export function providerKeyReady(providerId: string, credentials: CredentialEntry[], catalog: Catalog): boolean {
  if (providerId === CODEX_PROVIDER) {
    return catalog.providers.find((p) => p.id === CODEX_PROVIDER)?.auth.status === "configured";
  }
  return credentials.some((c) => c.provider === providerId && c.ok);
}

export function defaultCustom(catalog: Catalog): RoleSetting {
  const provider = selectableProviders(catalog)[0]?.id ?? null;
  const modelId = provider ? firstModelId(catalog, provider) : null;
  return { mode: "custom", provider, modelId, thinkingLevel: "off", stale: false };
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
