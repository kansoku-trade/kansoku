import type { AuthContext, CredentialStore } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type { MutableModels } from "@earendil-works/pi-ai";

export const SINGLE_KEY_PROVIDERS: ReadonlySet<string> = new Set([
  "anthropic",
  "openai",
  "deepseek",
  "google",
  "xai",
  "groq",
  "mistral",
  "openrouter",
  "together",
  "fireworks",
  "cerebras",
  "minimax",
  "zai",
  "nvidia",
  "opencode",
]);

const isolatedAuthContext: AuthContext = {
  env: async () => undefined,
  fileExists: async () => false,
};

let singleton: MutableModels | null = null;

export function initModelsRuntime(credentials: CredentialStore): MutableModels {
  if (singleton) {
    throw new Error("modelsRuntime: already initialized; call setModelsRuntimeForTests(null) first in tests");
  }
  singleton = builtinModels({ credentials, authContext: isolatedAuthContext });
  return singleton;
}

export function getModelsRuntime(): MutableModels {
  if (!singleton) {
    throw new Error("modelsRuntime: not initialized; call initModelsRuntime at startup before use");
  }
  return singleton;
}

export function setModelsRuntimeForTests(models: MutableModels | null): void {
  singleton = models;
}
