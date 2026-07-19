import type { EditionActivation, EditionActivationState } from "./editionLoader.js";

export interface EditionRuntimeStatus {
  state: EditionActivationState;
  bundlePresent: boolean;
  keyId?: string;
}

export interface EditionRuntimeStatusReader {
  readonly status: EditionRuntimeStatus;
}

export class EditionRuntime<TEdition> implements EditionRuntimeStatusReader {
  readonly status: EditionRuntimeStatus;
  readonly edition: TEdition | undefined;

  constructor(activation: EditionActivation<TEdition>) {
    this.status = {
      state: activation.state,
      bundlePresent: activation.bundlePresent,
      keyId: activation.keyId,
    };
    this.edition = activation.edition;
  }
}
