export interface OverlayRuleOptions {
  manifestPath?: string;
  overlayRoot?: string;
  publicRoot?: string;
}

export interface OverlayRule {
  create(context: unknown): Record<string, (node: unknown) => void>;
  meta: Record<string, unknown>;
}

export interface OverlayPlugin {
  meta: { name: string; version: string };
  rules: Record<string, OverlayRule>;
}

export declare const overlayPlugin: OverlayPlugin;
