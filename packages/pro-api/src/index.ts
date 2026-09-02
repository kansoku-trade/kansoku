import type { DeepDiveStartResult, DeepDiveState } from './aiTypes.js';
import type { LicenseSnapshot } from './licenseTypes.js';

export * from './aiTypes.js';
export * from './licenseTypes.js';
export * from './detectors.js';
export * from './trainerTypes.js';
export * from './trainerTrade.js';

// Shared contract between core's registration seam (packages/core/src/pro/hooks.ts)
// and the pro composition that supplies the real implementation at start() —
// not host-context ABI, kept deliberately.
export interface ProHooks {
  requestImmediateFollow(symbol: string): void | Promise<void>;
  startDeepDiveForNote(note: string): DeepDiveStartResult;
  deepDiveStatus(): DeepDiveState;
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

/** A host-owned filesystem mount that a Pro AI extension exposes for tool writes. */
export interface ProAiWriteMount {
  name: string;
  root: string;
  include?: string[];
  exclude?: string[];
}

export interface ProAiMemoryScope {
  symbol?: string;
  market?: string;
}

/**
 * Memory contract between core and the Pro composition. Pro owns the files,
 * truncation, and license gate; core owns where the text lands in the prompt
 * and which surfaces may write.
 */
export interface ProAiMemory {
  indexContext(): Promise<string | undefined>;
  scopeContext(scope: ProAiMemoryScope): Promise<string | undefined>;
  writeMount(): ProAiWriteMount | undefined;
}
