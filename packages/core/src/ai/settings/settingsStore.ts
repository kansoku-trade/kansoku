import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import type { Db } from '../../db/index.js';
import { aiRoleSettings } from '../../db/schema.js';

export type AiTaskRole = 'comment' | 'analyst' | 'deepDive' | 'chat' | 'memory';
export type AiRole = AiTaskRole | 'primary';
export type RoleMode = 'custom' | 'disabled' | 'inherit';

export const TASK_ROLES: AiTaskRole[] = ['comment', 'analyst', 'deepDive', 'chat', 'memory'];

export interface RoleSetting {
  mode: RoleMode;
  provider: string | null;
  modelId: string | null;
  thinkingLevel: ModelThinkingLevel | null;
}

export interface SettingsStore {
  getRole(role: AiRole): RoleSetting;
  listRoles(): Record<AiRole, RoleSetting>;
  setRole(role: AiRole, setting: RoleSetting): void;
  revision(): number;
}

const ROLES: AiRole[] = ['primary', ...TASK_ROLES];

function defaultFor(role: AiRole): RoleSetting {
  return {
    mode: role === 'primary' ? 'disabled' : 'inherit',
    provider: null,
    modelId: null,
    thinkingLevel: null,
  };
}

function validate(role: AiRole, setting: RoleSetting): void {
  if (setting.mode === 'inherit' && role === 'primary') {
    throw new Error(`settingsStore: mode "inherit" is not allowed for role "primary"`);
  }
  if (
    setting.mode === 'custom' &&
    (!setting.provider || !setting.modelId || !setting.thinkingLevel)
  ) {
    throw new Error(
      `settingsStore: mode "custom" requires provider, modelId, and thinkingLevel for role "${role}"`,
    );
  }
}

export function createSettingsStore(db: Db): SettingsStore {
  const cache = new Map<AiRole, RoleSetting>();
  let rev = 0;

  const rows = db.select().from(aiRoleSettings).all();
  const byRole = new Map(rows.map((row) => [row.role, row]));
  for (const role of ROLES) {
    const row = byRole.get(role);
    if (!row) {
      console.warn(`settingsStore: no row for role "${role}" at load time, using default`);
      cache.set(role, defaultFor(role));
      continue;
    }
    cache.set(role, {
      mode: row.mode as RoleMode,
      provider: row.provider,
      modelId: row.modelId,
      thinkingLevel: row.thinkingLevel as ModelThinkingLevel | null,
    });
  }

  return {
    getRole(role: AiRole): RoleSetting {
      const setting = cache.get(role);
      return setting ? { ...setting } : defaultFor(role);
    },

    listRoles(): Record<AiRole, RoleSetting> {
      const result = {} as Record<AiRole, RoleSetting>;
      for (const role of ROLES) {
        const setting = cache.get(role);
        result[role] = setting ? { ...setting } : defaultFor(role);
      }
      return result;
    },

    setRole(role: AiRole, setting: RoleSetting): void {
      validate(role, setting);
      const persisted: RoleSetting =
        setting.mode === 'custom'
          ? { ...setting }
          : { mode: setting.mode, provider: null, modelId: null, thinkingLevel: null };
      const updatedAt = new Date().toISOString();

      db.insert(aiRoleSettings)
        .values({
          role,
          mode: persisted.mode,
          provider: persisted.provider,
          modelId: persisted.modelId,
          thinkingLevel: persisted.thinkingLevel,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: aiRoleSettings.role,
          set: {
            mode: persisted.mode,
            provider: persisted.provider,
            modelId: persisted.modelId,
            thinkingLevel: persisted.thinkingLevel,
            updatedAt,
          },
        })
        .run();

      cache.set(role, persisted);
      rev += 1;
    },

    revision(): number {
      return rev;
    },
  };
}

let active: SettingsStore | null = null;

export function setActiveSettingsStore(store: SettingsStore | null): void {
  active = store;
}

export function getActiveSettingsStore(): SettingsStore {
  if (!active) {
    throw new Error(
      'settingsStore: no active settings store; call setActiveSettingsStore before use',
    );
  }
  return active;
}

export function activeSettingsRevision(): number {
  return active ? active.revision() : 0;
}
