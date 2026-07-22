import { defineRoutes } from './defineRoutes.js';

export type PendingConflict = {
  dest: string;
  templatePath: string;
  reason: 'target-exists-no-state';
};

export type PendingUpdate = {
  dest: string;
  templatePath: string;
  oldTemplateHash: string;
  newTemplateHash: string;
};

export type AgentKitLocation =
  | { kind: 'follow-data-root' }
  | { kind: 'custom'; path: string };

export type AgentKitStatus = {
  enabled: boolean;
  location: AgentKitLocation;
  resolvedPath: string | null;
  followBlocked: boolean;
  dataRoot: string;
  lastSyncAt?: string;
  kitVersion?: string;
  pendingConflicts?: PendingConflict[];
  pendingUpdates?: PendingUpdate[];
};

export type AgentKitSyncResult = {
  conflicts: PendingConflict[];
  updates: PendingUpdate[];
};

export type AgentKitSetEnabledResult =
  | { enabled: false }
  | ({ enabled: true } & AgentKitSyncResult);

export interface AgentKitApi {
  getStatus(): Promise<AgentKitStatus>;
  setEnabled(input: { enabled: boolean }): Promise<AgentKitSetEnabledResult>;
  forceSync(): Promise<AgentKitSyncResult>;
  resolveConflict(input: {
    dest: string;
    choice: 'use-template' | 'keep-original';
  }): Promise<{ dest: string }>;
  applyUpdate(input: { dest: string }): Promise<{ dest: string }>;
  clean(): Promise<{ cleaned: true }>;
  followDataRoot(): Promise<AgentKitStatus>;
  pickCustomLocation(): Promise<AgentKitStatus>;
}

export const agentKitRoutes = defineRoutes<AgentKitApi>('agentKit', {
  getStatus: { method: 'GET', path: '/' },
  setEnabled: { method: 'PUT', path: '/enabled' },
  forceSync: { method: 'POST', path: '/force-sync' },
  resolveConflict: { method: 'POST', path: '/conflicts/resolve' },
  applyUpdate: { method: 'POST', path: '/updates/apply' },
  clean: { method: 'POST', path: '/clean' },
  followDataRoot: { method: 'POST', path: '/location/follow' },
  pickCustomLocation: { method: 'POST', path: '/location/pick' },
});
