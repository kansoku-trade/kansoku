import type { DeepDiveStartResult, DeepDiveState } from './aiTypes.js';
import type { LicenseSnapshot } from './licenseTypes.js';

export * from './aiTypes.js';
export * from './licenseTypes.js';

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

export type ProAiSurface =
  'assistant' | 'chart-chat' | 'analyst' | 'deep-dive' | 'research-chat' | 'research-refresh';

/** A host-owned filesystem mount that a Pro AI extension may expose read-only. */
export interface ProAiReadMount {
  name: string;
  root: string;
  include?: string[];
  exclude?: string[];
}

export interface ProAiTurnContext {
  surface: ProAiSurface;
  sessionId: string;
  symbol?: string;
  market?: string;
}

export interface ProAiPreparedTurn {
  /** Ephemeral provider-facing context. Core injects it through MessagesEngine. */
  promptContext?: string;
  /** Optional read-only mounts consumed by Core's generic FS tools. */
  readMounts?: ProAiReadMount[];
}

export interface ProAiTranscriptMessage {
  role: 'user' | 'assistant' | 'tool';
  text: string;
}

export interface ProAiCompletedTurn extends ProAiTurnContext {
  messages: ProAiTranscriptMessage[];
}

export interface ProAiExtension {
  prepareTurn(context: ProAiTurnContext): Promise<ProAiPreparedTurn>;
  afterTurn?(context: ProAiCompletedTurn): void | Promise<void>;
}

export interface ProRuntimeHostContext {
  watchedMarkets?: unknown;
  aiSettingsStore?: unknown;
  production?: boolean;
  kansokuHome?: string;
  licenseGate?: ProLicenseGate;
}

export interface ProModule {
  hooks: ProHooks;
  aiExtension?: ProAiExtension;
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
    host?: ProRuntimeHostContext,
  ) => void | Promise<void>;
  migrations?: string;
}
