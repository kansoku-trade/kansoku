export interface OverlayMapping {
  destination: string;
  hasBase: boolean;
  source: string;
  sourceRelative: string;
}

export interface OverlaySyncOptions {
  publicRoot: string;
  overlayRoot: string;
  manifestPath: string;
  statePath: string;
  checkOnly?: boolean;
}

export interface OverlaySyncResult {
  errors: string[];
  mappings: OverlayMapping[];
  summary: string[];
}

export function runOverlaySync(options: OverlaySyncOptions): OverlaySyncResult;
