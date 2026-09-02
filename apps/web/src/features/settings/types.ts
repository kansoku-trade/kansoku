import type { Market } from '@kansoku/shared/time';

export type RoleMode = 'custom' | 'disabled' | 'inherit';
export type Role = 'comment' | 'analyst' | 'deepDive' | 'chat' | 'casePick' | 'title';

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

type MasterKeyStatus = 'ready' | 'missing' | 'invalid';

interface ProviderEndpoint {
  provider: string;
  baseUrl: string;
}

export interface AiSettings {
  roles: AiRoles;
  credentials: CredentialEntry[];
  masterKey: MasterKeyStatus;
  endpoints: ProviderEndpoint[];
}

export interface RoleUsage {
  calls: number;
  cost: number;
}

export interface UsageToday {
  roles: Record<Role, RoleUsage>;
  total: RoleUsage;
}

interface CatalogModel {
  id: string;
  name: string;
  thinkingLevels: string[];
}

interface CatalogAuth {
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

export const ROLES: Role[] = ['comment', 'analyst', 'deepDive', 'chat', 'casePick', 'title'];

function defaultRoleSetting(role: Role | 'primary'): RoleSetting {
  return {
    mode: role === 'primary' ? 'disabled' : 'inherit',
    provider: null,
    modelId: null,
    thinkingLevel: null,
    stale: false,
  };
}

export function normalizeAiRoles(roles: Partial<AiRoles> | null | undefined): AiRoles {
  const normalized = {} as AiRoles;
  for (const role of ['primary', ...ROLES] as const) {
    normalized[role] = roles?.[role] ?? defaultRoleSetting(role);
  }
  return normalized;
}

export type PersistedAiSettings = Omit<AiSettings, 'roles' | 'endpoints'> & {
  roles?: Partial<AiRoles> | null;
  endpoints?: ProviderEndpoint[] | null;
};

// react-query persists settings.getAi responses to localStorage
// (queryClient.ts) and restores them before the live refetch lands, so
// anything added after a user's last persisted snapshot — `endpoints`
// (2026-07-29), the 'title' role — is briefly absent on app launch.
// Normalize the whole snapshot here so consumers can index it directly; a
// consumer reading a new field off the raw snapshot crashes the settings page
// for everyone upgrading from the previous release.
export function normalizeAiSettings(settings: PersistedAiSettings): AiSettings {
  return {
    ...settings,
    roles: normalizeAiRoles(settings.roles),
    endpoints: settings.endpoints ?? [],
  };
}

export const ROLE_LABEL: Record<Role, string> = {
  comment: '盘中快评',
  analyst: '升级分析',
  deepDive: '深度研究',
  chat: '追问',
  casePick: '案例精选',
  title: '会话标题',
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

const THINKING_LABEL: Record<string, string> = {
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
