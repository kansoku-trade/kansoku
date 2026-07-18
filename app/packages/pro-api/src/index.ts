import type { DeepDiveStartResult, DeepDiveState } from "./aiTypes.js";
import type { LicenseService, LicenseSnapshot } from "./licenseTypes.js";

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

export interface ProModule {
  hooks: ProHooks;
  license?: LicenseService;
  subscription?: { url: string; priceLabel?: string };
  tsukiModules?: unknown[];
  ipcServiceClasses?: unknown[];
  channels?: ProChannel[];
  startScheduler?: (ctx?: ProHostContext) => void | (() => void);
  // host carries kernel-owned singletons across the module boundary: the pro
  // slot loads its own copy of @kansoku/core (tsx in dev, bundled when
  // packaged), so core's module-level singletons are NOT shared — any state
  // pro must observe live has to be handed over explicitly here.
  initRuntime?: (
    db: unknown,
    secretBox: unknown,
    host?: { watchedMarkets?: unknown; aiSettingsStore?: unknown; production?: boolean },
  ) => void | Promise<void>;
  migrations?: string;
}
