import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AgentKitLocation } from '@kansoku/core/contract/agentKit';

export type AgentKitStoreState = {
  enabled: boolean;
  location: AgentKitLocation;
  lastSyncAt?: string;
};

export interface AgentKitStore {
  read(): AgentKitStoreState;
  write(next: AgentKitStoreState): void;
  exists(): boolean;
}

const FALLBACK: AgentKitStoreState = { enabled: false, location: { kind: 'follow-data-root' } };

function parseLocation(raw: unknown): AgentKitLocation {
  if (raw && typeof raw === 'object') {
    const kind = (raw as { kind?: unknown }).kind;
    if (kind === 'custom' && typeof (raw as { path?: unknown }).path === 'string') {
      return { kind: 'custom', path: (raw as { path: string }).path };
    }
    if (kind === 'follow-data-root') return { kind: 'follow-data-root' };
  }
  return { kind: 'follow-data-root' };
}

export function createAgentKitStore(filePath: string): AgentKitStore {
  return {
    exists() {
      return existsSync(filePath);
    },
    read() {
      if (!existsSync(filePath)) return { ...FALLBACK };
      try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
        return {
          enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : false,
          location: parseLocation(parsed.location),
          lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : undefined,
        };
      } catch {
        return { ...FALLBACK };
      }
    },
    write(next) {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    },
  };
}

export function defaultAgentKitStore(app: Pick<Electron.App, 'getPath'>): AgentKitStore {
  return createAgentKitStore(join(app.getPath('userData'), 'agent-kit.json'));
}
