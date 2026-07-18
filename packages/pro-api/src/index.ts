import type { DeepDiveStartResult, DeepDiveState } from "./aiTypes.js";
import type { LicenseSnapshot } from "./licenseTypes.js";

export * from "./aiTypes.js";
export * from "./licenseTypes.js";

export interface ProHooks {
  requestImmediateFollow(symbol: string): void | Promise<void>;
  startDeepDiveForNote(note: string): DeepDiveStartResult;
  deepDiveStatus(): DeepDiveState;
}

export interface ProHostContext {
  db: unknown;
  realtimeHub: unknown;
  longbridgeClient: unknown;
  dataDir: string;
}

export interface ProCapabilities {
  pro: boolean;
  licensed: boolean;
  license?: LicenseSnapshot;
}

export interface ProChannel {
  kind: string;
  parse: (raw: Record<string, unknown>) => Record<string, unknown> | null;
  attach: (
    msg: Record<string, unknown>,
    push: (envelope: string) => void,
  ) => (() => void) | Promise<() => void>;
}

export interface ProLicenseGate {
  isLicensed(): boolean;
}

export interface ProModule {
  hooks: ProHooks;
  tsukiModules?: unknown[];
  ipcServiceClasses?: unknown[];
  channels?: ProChannel[];
  startScheduler?: (ctx?: ProHostContext) => void | (() => void);
  // host carries kernel-owned singletons across the module boundary: the pro
  // slot loads its own copy of @kansoku/core (tsx in dev, bundled when
  // packaged), so core's module-level singletons are NOT shared — any state
  // pro must observe live has to be handed over explicitly here. License state
  // lives entirely in core (see packages/core/src/license) — pro must read it
  // through `licenseGate`, never by importing core's license singleton directly.
  initRuntime?: (
    db: unknown,
    secretBox: unknown,
    host?: {
      watchedMarkets?: unknown;
      aiSettingsStore?: unknown;
      production?: boolean;
      licenseGate?: ProLicenseGate;
    },
  ) => void | Promise<void>;
  migrations?: string;
}
