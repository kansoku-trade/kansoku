export interface LongbridgeCredentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
}

export interface CredentialsGetResult {
  configured: boolean;
  lastError: string | null;
}

export type SetCredentialsResult = { ok: true } | { ok: false; error: string };
export type TestCredentialsResult = { ok: true } | { ok: false; error: string };

export interface DesktopCredentialsBridge {
  get(): Promise<CredentialsGetResult>;
  set(creds: LongbridgeCredentials): Promise<SetCredentialsResult>;
  clear(): Promise<void>;
  test(creds: LongbridgeCredentials): Promise<TestCredentialsResult>;
}

interface DesktopGlobal {
  credentials?: DesktopCredentialsBridge;
}

export function getDesktopCredentialsBridge(
  win: unknown = typeof window === "undefined" ? undefined : window,
): DesktopCredentialsBridge | null {
  const bridge = (win as { desktop?: DesktopGlobal } | undefined)?.desktop?.credentials;
  return bridge ?? null;
}

const FRIENDLY_ERRORS: Array<{ match: RegExp; text: string }> = [
  { match: /secure storage unavailable/i, text: "系统钥匙串不可用，请检查系统钥匙串设置" },
  { match: /corrupt credentials|failed to decrypt/i, text: "凭证文件已损坏，请重新填写并保存" },
  { match: /failed to read credentials file/i, text: "凭证文件读取失败，请重新填写并保存" },
  { match: /rejected the credentials/i, text: "鉴权失败，请检查凭证是否正确" },
  { match: /could not reach longbridge/i, text: "网络错误，请检查网络连接后重试" },
  { match: /did not respond in time/i, text: "连接超时，请稍后重试" },
];

export function friendlyCredentialError(raw: string | null): string | null {
  if (!raw) return null;
  const hit = FRIENDLY_ERRORS.find((entry) => entry.match.test(raw));
  return hit ? hit.text : raw;
}
