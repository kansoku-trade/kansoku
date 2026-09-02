import type { AgentKitLocation } from '@kansoku/core/contract/agentKit';

export function resolveAgentKitDir(location: AgentKitLocation, dataRoot: string): string {
  if (location.kind === 'custom') return location.path;
  return dataRoot;
}
