export interface CredentialsGetResult {
  configured: boolean;
  method?: string | null;
  lastError: string | null;
  state: 'ready' | 'cli_missing' | 'login_required' | 'token_unreadable';
  cliPath: string | null;
}

export interface OpencliStatus {
  state: 'ready' | 'not_installed' | 'extension_missing' | 'no_session';
  cliPath: string | null;
  lastError: string | null;
}

export interface DesktopCredentialsBridge {
  get(): Promise<CredentialsGetResult>;
}

interface DesktopGlobal {
  credentials?: DesktopCredentialsBridge;
}

export function getDesktopCredentialsBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): DesktopCredentialsBridge | null {
  return (win as { desktop?: DesktopGlobal } | undefined)?.desktop?.credentials ?? null;
}
