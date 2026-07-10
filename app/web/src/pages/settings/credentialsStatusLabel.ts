import { friendlyCredentialError } from "./desktopCredentials";

export function deriveCredentialsStatusLabel(params: {
  serverConfigured: boolean;
  storeConfigured: boolean;
  lastError: string | null;
}): string {
  if (params.serverConfigured) {
    return params.storeConfigured ? "已配置" : "使用 OAuth 环境凭证（无需在此配置）";
  }
  return friendlyCredentialError(params.lastError) ?? "未配置";
}
