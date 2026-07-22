import type {
  AgentKitApi,
  AgentKitSetEnabledResult,
  AgentKitStatus,
  AgentKitSyncResult,
} from '@kansoku/core/contract/agentKit';
import type { TransportEnvelope } from '@kansoku/core/contract/index';
import { getShellRpc } from '../desktop/shellRpc';

export type {
  AgentKitLocation,
  AgentKitSetEnabledResult,
  AgentKitStatus,
  AgentKitSyncResult,
  PendingConflict,
  PendingUpdate,
} from '@kansoku/core/contract/agentKit';

export type DesktopAgentKitBridge = AgentKitApi;

function unwrap<T>(envelope: TransportEnvelope<T>): T {
  if (!envelope.ok) throw new Error(envelope.error);
  return envelope.data;
}

export function getDesktopAgentKitBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): DesktopAgentKitBridge | null {
  const rpc = getShellRpc(win);
  if (!rpc) return null;
  return {
    getStatus: async () =>
      unwrap((await rpc.invoke('agentKit.getStatus')) as TransportEnvelope<AgentKitStatus>),
    setEnabled: async (input) =>
      unwrap(
        (await rpc.invoke('agentKit.setEnabled', input)) as TransportEnvelope<AgentKitSetEnabledResult>,
      ),
    forceSync: async () =>
      unwrap((await rpc.invoke('agentKit.forceSync')) as TransportEnvelope<AgentKitSyncResult>),
    resolveConflict: async (input) =>
      unwrap(
        (await rpc.invoke('agentKit.resolveConflict', input)) as TransportEnvelope<{
          dest: string;
        }>,
      ),
    applyUpdate: async (input) =>
      unwrap(
        (await rpc.invoke('agentKit.applyUpdate', input)) as TransportEnvelope<{ dest: string }>,
      ),
    clean: async () =>
      unwrap((await rpc.invoke('agentKit.clean')) as TransportEnvelope<{ cleaned: true }>),
    followDataRoot: async () =>
      unwrap((await rpc.invoke('agentKit.followDataRoot')) as TransportEnvelope<AgentKitStatus>),
    pickCustomLocation: async () =>
      unwrap(
        (await rpc.invoke('agentKit.pickCustomLocation')) as TransportEnvelope<AgentKitStatus>,
      ),
  };
}
