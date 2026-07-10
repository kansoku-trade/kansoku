export interface ExternalApiState {
  enabled: boolean;
  port: number | null;
  token: string | null;
}

export interface ExternalApiBridge {
  getState(): Promise<ExternalApiState>;
  enable(): Promise<ExternalApiState>;
  disable(): Promise<ExternalApiState>;
  resetToken(): Promise<ExternalApiState>;
}

interface DesktopGlobal {
  externalApi?: ExternalApiBridge;
}

export function getExternalApiBridge(
  win: unknown = typeof window === "undefined" ? undefined : window,
): ExternalApiBridge | null {
  const bridge = (win as { desktop?: DesktopGlobal } | undefined)?.desktop?.externalApi;
  return bridge ?? null;
}

export function maskToken(token: string): string {
  if (token.length <= 10) return "•".repeat(token.length);
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}
