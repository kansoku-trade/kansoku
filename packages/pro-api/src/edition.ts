export const EDITION_ABI_VERSION = 1;

export type EditionRuntimeKind = 'server' | 'desktop' | 'web';

export interface EditionEntry<THost, TEdition> {
  readonly abiVersion: typeof EDITION_ABI_VERSION;
  readonly runtime: EditionRuntimeKind;
  createEdition(host: THost): TEdition | Promise<TEdition>;
}
