export interface ShellRpc {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
}

export function getShellRpc(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): ShellRpc | null {
  return (win as { desktop?: { rpc?: ShellRpc } } | undefined)?.desktop?.rpc ?? null;
}
