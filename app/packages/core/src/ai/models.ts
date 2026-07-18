import type { Api, Model, ModelThinkingLevel, ThinkingLevel } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { getModelsRuntime } from "./modelsRuntime.js";
import { type AiTaskRole, getActiveSettingsStore, type RoleSetting } from "./settingsStore.js";

export type ModelRef = { provider: string; id: string; thinkingLevel?: ThinkingLevel };

// thinkingLevel rides on the resolved model so it reaches the Agent factories
// without threading an extra field through every deps interface.
export type AiModel = Model<Api> & { thinkingLevel?: ModelThinkingLevel };

const THINKING_LEVELS: ReadonlySet<string> = new Set(["minimal", "low", "medium", "high", "xhigh"]);

export type AiConfig = {
  commentModel: AiModel | null;
  analystModel: AiModel | null;
  deepDiveModel: AiModel | null;
  chatModel: AiModel | null;
};

type ModelLookup = (provider: string, id: string) => AiModel | undefined;

const catalog = builtinModels();
const defaultLookup: ModelLookup = (provider, id) => catalog.getModel(provider, id);

export function parseModelRef(raw: string): ModelRef | null {
  const slash = raw.indexOf("/");
  if (slash <= 0) return null;
  const provider = raw.slice(0, slash).trim();
  let id = raw.slice(slash + 1).trim();
  if (!provider || !id) return null;
  let thinkingLevel: ThinkingLevel | undefined;
  const colon = id.lastIndexOf(":");
  if (colon > 0) {
    const level = id.slice(colon + 1);
    if (THINKING_LEVELS.has(level)) {
      thinkingLevel = level as ThinkingLevel;
      id = id.slice(0, colon);
    }
  }
  return thinkingLevel ? { provider, id, thinkingLevel } : { provider, id };
}

export function resolveModel(
  envValue: string | undefined,
  lookup: ModelLookup = defaultLookup,
): AiModel | null {
  if (!envValue) return null;
  const ref = parseModelRef(envValue);
  if (!ref) return null;
  try {
    const model = lookup(ref.provider, ref.id) ?? null;
    if (!model) return null;
    return ref.thinkingLevel ? { ...model, thinkingLevel: ref.thinkingLevel } : model;
  } catch (err) {
    console.error(`resolveModel: getModel failed for "${envValue}": ${String(err)}`);
    return null;
  }
}

function resolveCustom(setting: RoleSetting): AiModel | null {
  let model: AiModel | undefined;
  try {
    model = getModelsRuntime().getModel(setting.provider as string, setting.modelId as string);
  } catch {
    // Unit-level consumers may use the static catalog without initializing the app runtime.
    model = catalog.getModel(setting.provider as string, setting.modelId as string);
  }
  if (!model) return null;
  return { ...model, thinkingLevel: setting.thinkingLevel ?? undefined };
}

function resolveRole(setting: RoleSetting): AiModel | null {
  if (setting.mode === "custom") return resolveCustom(setting);
  return null;
}

export function aiConfig(): AiConfig {
  const store = getActiveSettingsStore();
  const primaryModel = resolveRole(store.getRole("primary"));
  const resolve = (role: AiTaskRole): AiModel | null => {
    const setting = store.getRole(role);
    return setting.mode === "inherit" ? primaryModel : resolveRole(setting);
  };
  return {
    commentModel: resolve("comment"),
    analystModel: resolve("analyst"),
    deepDiveModel: resolve("deepDive"),
    chatModel: resolve("chat"),
  };
}
