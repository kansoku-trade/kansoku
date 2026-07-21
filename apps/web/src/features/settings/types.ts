import type { Market } from '@kansoku/shared/time';

export type RoleMode = 'custom' | 'disabled' | 'inherit';
export type Role = 'comment' | 'analyst' | 'deepDive' | 'chat' | 'memory';

export interface RoleSetting {
  mode: RoleMode;
  provider: string | null;
  modelId: string | null;
  thinkingLevel: string | null;
  stale: boolean;
}

export type AiRoles = Record<Role | 'primary', RoleSetting>;

export interface CredentialEntry {
  provider: string;
  kind: 'api_key' | 'oauth';
  masked: string | null;
  updatedAt: string;
  ok: boolean;
}

export type MasterKeyStatus = 'ready' | 'missing' | 'invalid';

export interface AiSettings {
  roles: AiRoles;
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
  kind: 'api_key' | 'oauth';
  status: 'configured' | 'missing' | 'error';
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

export const ROLES: Role[] = ['comment', 'analyst', 'deepDive', 'chat', 'memory'];

function defaultRoleSetting(role: Role | 'primary'): RoleSetting {
  return {
    mode: role === 'primary' ? 'disabled' : 'inherit',
    provider: null,
    modelId: null,
    thinkingLevel: null,
    stale: false,
  };
}

// react-query persists settings.getAi responses to localStorage
// (queryClient.ts) and restores them before the live refetch lands, so a
// role added after a user's last persisted snapshot (e.g. 'memory' on
// 2026-07-20) is briefly missing from `roles` on app launch — normalize so
// every ROLES consumer can always index it.
export function normalizeAiRoles(roles: Partial<AiRoles> | null | undefined): AiRoles {
  const normalized = {} as AiRoles;
  for (const role of ['primary', ...ROLES] as const) {
    normalized[role] = roles?.[role] ?? defaultRoleSetting(role);
  }
  return normalized;
}

export const ROLE_LABEL: Record<Role, string> = {
  comment: '盘中快评',
  analyst: '升级分析',
  deepDive: '深度研究',
  chat: '追问',
  memory: '记忆整理',
};

export const CODEX_PROVIDER = 'openai-codex';
export const LOBEHUB_PROVIDER = 'lobehub';

export interface LobeHubAccount {
  status: 'unavailable' | 'disconnected' | 'connected' | 'refresh_required';
  email: string | null;
  name: string | null;
  userId: string | null;
  updatedAt: string | null;
  baseUrl: string;
}

export interface LobeHubCredits {
  availableCredits: number;
  availableUsd: number;
  currentMonthCredits: number;
  currentMonthUsd: number;
  plan: string | null;
  updatedAt: string;
}

export interface LobeHubDeviceLogin {
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresAt: string;
  intervalSeconds: number;
}

export const THINKING_LABEL: Record<string, string> = {
  off: '关闭思考',
  minimal: '最简',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '极高',
};

export function thinkingLabel(level: string | null): string {
  return level ? (THINKING_LABEL[level] ?? level) : THINKING_LABEL.off;
}

export type { Market };
export const MARKET_LABEL: Record<Market, string> = { US: '美股', HK: '港股', CN: 'A 股' };
