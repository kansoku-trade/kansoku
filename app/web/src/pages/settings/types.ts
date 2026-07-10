export type RoleMode = "custom" | "disabled" | "inherit";
export type Role = "comment" | "analyst" | "deepDive" | "chat";

export interface RoleSetting {
  mode: RoleMode;
  provider: string | null;
  modelId: string | null;
  thinkingLevel: string | null;
  stale: boolean;
}

export interface CredentialEntry {
  provider: string;
  masked: string | null;
  updatedAt: string;
  ok: boolean;
}

export type MasterKeyStatus = "ready" | "missing" | "invalid";

export interface AiSettings {
  roles: Record<Role | "primary", RoleSetting>;
  credentials: CredentialEntry[];
  masterKey: MasterKeyStatus;
}

export interface RoleUsage {
  calls: number;
  cost: number;
}

export interface UsageToday {
  roles: Record<Role, RoleUsage>;
  total: RoleUsage;
}

export interface CatalogModel {
  id: string;
  name: string;
  thinkingLevels: string[];
}

export interface CatalogAuth {
  kind: "api_key" | "oauth";
  status: "configured" | "missing" | "error";
}

export interface CatalogProvider {
  id: string;
  name: string;
  auth: CatalogAuth;
  models: CatalogModel[];
}

export interface Catalog {
  providers: CatalogProvider[];
}

export const ROLES: Role[] = ["comment", "analyst", "deepDive", "chat"];

export const ROLE_LABEL: Record<Role, string> = {
  comment: "盘中快评",
  analyst: "升级分析",
  deepDive: "深度研究",
  chat: "追问",
};

export const CODEX_PROVIDER = "openai-codex";

export const THINKING_LABEL: Record<string, string> = {
  off: "关闭思考",
  minimal: "最简",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "极高",
};

export function thinkingLabel(level: string | null): string {
  return level ? (THINKING_LABEL[level] ?? level) : THINKING_LABEL.off;
}
