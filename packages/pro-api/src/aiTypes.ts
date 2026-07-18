export type MasterKeyStatus = "ready" | "missing" | "invalid";

export interface SecretBox {
  status(): MasterKeyStatus;
  encrypt(provider: string, plaintext: string): string;
  decrypt(provider: string, envelope: string): string;
  resetKey(): void;
}

export interface CredentialListEntry {
  provider: string;
  kind: "api_key" | "oauth";
  masked: string | null;
  updatedAt: string;
  ok: boolean;
}

export type AiTaskRole = "comment" | "analyst" | "deepDive" | "chat";
export type AiRole = AiTaskRole | "primary";
export type RoleMode = "custom" | "disabled" | "inherit";

export interface RoleSetting {
  mode: RoleMode;
  provider: string | null;
  modelId: string | null;
  thinkingLevel: string | null;
}

export interface RoleSettingOut extends RoleSetting {
  stale: boolean;
}

export interface SettingsAiOut {
  roles: Record<AiRole, RoleSettingOut>;
  credentials: CredentialListEntry[];
  masterKey: MasterKeyStatus;
}

export interface CatalogModel {
  id: string;
  name: string;
  thinkingLevels: string[];
}

export interface CatalogProvider {
  id: string;
  name: string;
  auth: { kind: "api_key" | "oauth"; status: "configured" | "missing" | "error" };
  models: CatalogModel[];
}

export type TestConnectionResult =
  | { ok: true; latencyMs: number }
  | { ok: false; status: 504 | 502; error: string; hint: string };

export interface UsageTodayOut {
  roles: Record<"comment" | "analyst" | "deepDive" | "chat", { calls: number; cost: number }>;
  total: { calls: number; cost: number };
}

export interface AiUsageRecord {
  ts: string;
  layer: string;
  symbol: string;
  model: string;
  origin?: string;
  calls: number;
  total_tokens: number;
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  cost_total: number;
}

export type DeepDiveState = {
  running: boolean;
  symbol?: string;
  startedAt?: string;
  lastResult?: { symbol: string; ok: boolean; finishedAt: string; error?: string; dirtyWarning?: boolean };
};

export type DeepDiveStartResult = { started: true } | { started: false; reason: "busy" | "disabled" };

export type ReassessResult = { started: boolean; reason?: string };
export type ReassessPhase = "preparing" | "researching" | "writing" | "finalizing";
export type ReassessStatus =
  | { running: false }
  | {
      running: true;
      origin: "manual" | "escalation";
      phase: ReassessPhase;
      activity: string;
      startedAt: string;
      updatedAt: string;
    };

export interface ChatSession {
  id: string;
  chartId: string;
  symbol: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatDisplayMessage {
  id: string;
  ts: string;
  kind: "user" | "assistant" | "tool";
  text?: string;
  label?: string;
  input?: string;
  output?: string;
  meta?: {
    provider: string;
    model: string;
    totalTokens: number;
    costTotal: number;
  };
}

export interface LobeHubDeviceLogin {
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresAt: string;
  intervalSeconds: number;
}

export type LobeHubDevicePollResult =
  | { status: "pending"; intervalSeconds: number }
  | { status: "connected" }
  | { status: "denied" }
  | { status: "expired" };

export interface LobeHubAccount {
  status: "unavailable" | "disconnected" | "connected" | "refresh_required";
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

export type AgentMessagePayload = unknown;

export interface AiSettingsService {
  getAi(): Promise<SettingsAiOut>;
  putRole(input: {
    role: string;
    mode?: unknown;
    provider?: unknown;
    modelId?: unknown;
    thinkingLevel?: unknown;
  }): Promise<{ role: AiRole } & RoleSetting>;
  deleteRole(input: { role: string }): Promise<{ role: AiRole; mode: "disabled" }>;
  putCredential(input: { provider: string; key?: unknown }): Promise<{ provider: string; masked: string | null }>;
  deleteCredential(input: { provider: string }): Promise<{ provider: string; deleted: true }>;
  getCatalog(): Promise<{ providers: CatalogProvider[] }>;
  testConnection(input: Record<string, unknown>): Promise<TestConnectionResult>;
  getUsageToday(): Promise<UsageTodayOut>;
  resetCredentials(): Promise<{ reset: true }>;
}
