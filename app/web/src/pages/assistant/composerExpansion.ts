export interface ComposerExpansionState {
  busy: boolean;
  focusedWithin: boolean;
  hasHint: boolean;
  hasReferences: boolean;
  hasText: boolean;
  modelPickerOpen: boolean;
  queueLength: number;
}

export function shouldExpandComposer(state: ComposerExpansionState): boolean {
  return (
    state.focusedWithin ||
    state.modelPickerOpen ||
    state.busy ||
    state.hasText ||
    state.queueLength > 0 ||
    state.hasReferences ||
    state.hasHint
  );
}
