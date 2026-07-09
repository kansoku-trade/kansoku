import type { Api, Model, ThinkingLevel } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";

export type ModelRef = { provider: string; id: string; thinkingLevel?: ThinkingLevel };

// thinkingLevel rides on the resolved model so it reaches the Agent factories
// without threading an extra field through every deps interface.
export type AiModel = Model<Api> & { thinkingLevel?: ThinkingLevel };

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

export function aiConfig(): AiConfig {
  const analystModel = resolveModel(process.env.AI_ANALYST_MODEL);
  return {
    commentModel: resolveModel(process.env.AI_COMMENT_MODEL),
    analystModel,
    deepDiveModel: resolveModel(process.env.AI_DEEPDIVE_MODEL),
    chatModel: resolveModel(process.env.AI_CHAT_MODEL) ?? analystModel,
  };
}
