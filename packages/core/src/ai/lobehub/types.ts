import type { Context, Model, StreamOptions } from "@earendil-works/pi-ai";

export const LOBEHUB_PROVIDER = "lobehub";
export const LOBEHUB_API = "lobehub-webapi";

export type LobeHubCloudErrorCode =
  | "not_authenticated"
  | "authorization_pending"
  | "authorization_denied"
  | "device_code_expired"
  | "refresh_required"
  | "insufficient_credits"
  | "model_unavailable"
  | "rate_limited"
  | "network_error"
  | "cloud_unavailable"
  | "protocol_incompatible";

export class LobeHubCloudError extends Error {
  constructor(
    public readonly code: LobeHubCloudErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "LobeHubCloudError";
  }
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

export interface LobeHubCloudGateway {
  readonly baseUrl: string;
  readonly available: boolean;
  startDeviceLogin(): Promise<LobeHubDeviceLogin>;
  pollDeviceLogin(): Promise<LobeHubDevicePollResult>;
  getAccount(): Promise<LobeHubAccount>;
  getCredits(): Promise<LobeHubCredits>;
  logout(): Promise<void>;
  refreshCredential(credential: { access: string; refresh: string; expires: number }): Promise<{
    access: string;
    refresh: string;
    expires: number;
  }>;
  listModels(): Promise<readonly Model<typeof LOBEHUB_API>[]>;
  stream(
    model: Model<typeof LOBEHUB_API>,
    context: Context,
    options?: StreamOptions,
  ): import("@earendil-works/pi-ai").AssistantMessageEventStream;
}
