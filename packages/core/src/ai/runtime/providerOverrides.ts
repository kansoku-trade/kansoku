import type { MutableModels, Provider } from '@earendil-works/pi-ai';
import { createProvider } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';

const originalProviders = new Map<string, Provider>();

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function delegateProvider(source: Provider, baseUrl: string): Provider {
  const refreshModels = source.refreshModels?.bind(source);
  const filterModels = source.filterModels?.bind(source);
  return {
    id: source.id,
    name: source.name,
    baseUrl,
    auth: source.auth,
    ...(source.headers ? { headers: source.headers } : {}),
    ...(refreshModels ? { refreshModels } : {}),
    ...(filterModels ? { filterModels } : {}),
    getModels: () => source.getModels().map((model) => ({ ...model, baseUrl })),
    stream(model, context, options) {
      return source.stream(model, context, options);
    },
    streamSimple(model, context, options) {
      return source.streamSimple(model, context, options);
    },
  };
}

function completionsProvider(source: Provider, baseUrl: string): Provider {
  // 中转站普遍只实现 OpenAI 的 completions 端点，而原 compat 是 responses 专用的，留着会盖掉 pi-ai 按新 baseUrl 的自动探测。
  return createProvider({
    id: source.id,
    name: source.name,
    baseUrl,
    auth: source.auth,
    models: source.getModels().map(({ compat: _compat, ...model }) => ({
      ...model,
      api: 'openai-completions' as const,
      baseUrl,
    })),
    api: openAICompletionsApi(),
  });
}

export function applyBaseUrlOverride(
  models: MutableModels,
  providerId: string,
  baseUrl: string | null,
): void {
  if (baseUrl === null) {
    const original = originalProviders.get(providerId);
    if (!original) return;
    originalProviders.delete(providerId);
    models.setProvider(original);
    return;
  }

  const source = originalProviders.get(providerId) ?? models.getProvider(providerId);
  if (!source) return;

  const normalized = normalizeBaseUrl(baseUrl);
  originalProviders.set(providerId, source);
  models.setProvider(
    providerId === 'openai'
      ? completionsProvider(source, normalized)
      : delegateProvider(source, normalized),
  );
}

export function resetProviderOverridesForTests(): void {
  originalProviders.clear();
}
