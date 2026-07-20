import type { DeepDiveStartResult, DeepDiveState } from './aiTypes.js';

export * from './aiTypes.js';
export * from './edition.js';
export * from './licenseTypes.js';

export interface EditionHooks {
  requestImmediateFollow(symbol: string): void | Promise<void>;
  startDeepDiveForNote(note: string): DeepDiveStartResult;
  deepDiveStatus(): DeepDiveState;
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

export interface EditionProCapabilities {
  hooks?: EditionHooks;
  aiExtension?: ProAiExtension;
}
