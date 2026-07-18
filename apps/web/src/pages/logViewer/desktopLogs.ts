export interface LogsInfo {
  path: string;
  dir: string;
}

export interface LogsTailResult {
  path: string;
  text: string;
}

export interface DesktopLogsBridge {
  getInfo(): Promise<LogsInfo>;
  tail(opts?: { maxBytes?: number }): Promise<LogsTailResult>;
  reveal(): Promise<{ ok: true }>;
  openDir(): Promise<{ ok: boolean; error?: string }>;
}

interface DesktopGlobal {
  logs?: DesktopLogsBridge;
}

export function getDesktopLogsBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): DesktopLogsBridge | null {
  return (win as { desktop?: DesktopGlobal } | undefined)?.desktop?.logs ?? null;
}
