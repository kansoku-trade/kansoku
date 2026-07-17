import type { ProHooks, ProModule } from "@kansoku/pro-api";

export const freeHooks: ProHooks = {
  async filterMacroForSymbol(_symbol, items) {
    return items;
  },
  listFollowedSymbols() {
    return [];
  },
  setSymbolFollowing(symbol, _following) {
    return { symbol, following: false, startedAt: null };
  },
  async listComments() {
    return [];
  },
  async listAllCommentDates() {
    return [];
  },
  activeSettingsRevision() {
    return 0;
  },
};

let activeModule: ProModule | null = null;

export function registerProModule(module: ProModule): void {
  activeModule = module;
}

export function extendProModule(patch: Partial<ProModule>): void {
  if (!activeModule) return;
  activeModule = { ...activeModule, ...patch };
}

export function getPro(): ProModule | null {
  return activeModule;
}

export function isProPresent(): boolean {
  return activeModule !== null;
}

export function unregisterProModuleForTests(): void {
  activeModule = null;
}

export function getProHooks(): ProHooks {
  return activeModule?.hooks ?? freeHooks;
}
