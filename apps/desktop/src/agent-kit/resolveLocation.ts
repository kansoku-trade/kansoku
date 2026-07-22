import type { AgentKitLocation } from '@kansoku/core/contract/agentKit';
import type { DataRootMode } from '../data/dataRoot/status.js';

export function resolveAgentKitDir(
  location: AgentKitLocation,
  dataRoot: string,
  dataRootMode: DataRootMode,
): string | null {
  if (location.kind === 'custom') return location.path;
  if (dataRootMode === 'default') return null;
  return dataRoot;
}

export function isFollowBlocked(location: AgentKitLocation, dataRootMode: DataRootMode): boolean {
  return location.kind === 'follow-data-root' && dataRootMode === 'default';
}
