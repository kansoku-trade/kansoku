import type {
  AuthContext,
  CredentialInfo,
  CredentialStore,
  MutableModels,
} from '@earendil-works/pi-ai';
import { registerBunOAuthFlows } from '@earendil-works/pi-ai/bun-oauth';
import { getEnvApiKey } from '@earendil-works/pi-ai/compat';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';

const CODEX_PROVIDER = 'openai-codex';

export const SINGLE_KEY_PROVIDERS: ReadonlySet<string> = new Set([
  'anthropic',
  'openai',
  'deepseek',
  'google',
  'xai',
  'groq',
  'mistral',
  'openrouter',
  'together',
  'fireworks',
  'cerebras',
  'moonshotai',
  'kimi-coding',
  'minimax',
  'zai',
  'nvidia',
  'opencode',
]);

const isolatedAuthContext: AuthContext = {
  env: async () => undefined,
  fileExists: async () => false,
};

let singleton: MutableModels | null = null;

function installStaticCodexOAuth(models: MutableModels): void {
  // pi-ai 的内置 provider 会通过运行时动态 import 加载 OAuth 实现；桌面主进程
  // 合并为单个构建产物后没有对应文件。registerBunOAuthFlows 把各家 OAuth 流程
  // 静态注册进 lazy 加载器（0.80.10 起的官方钩子），随后只覆写 login——应用
  // 只复用 codex CLI 的登录态，不在应用内发起登录。
  registerBunOAuthFlows();

  const provider = models.getProvider(CODEX_PROVIDER);
  const oauth = provider?.auth.oauth;
  if (!provider || !oauth) {
    throw new Error('modelsRuntime: openai-codex OAuth provider is unavailable');
  }

  models.setProvider({
    ...provider,
    auth: {
      ...provider.auth,
      oauth: {
        ...oauth,
        async login() {
          throw new Error('OpenAI Codex 登录由 codex CLI 管理，请先在终端完成登录');
        },
      },
    },
  });
}

export function initModelsRuntime(credentials: CredentialStore): MutableModels {
  if (singleton) {
    throw new Error(
      'modelsRuntime: already initialized; call setModelsRuntimeForTests(null) first in tests',
    );
  }
  const models = builtinModels({ credentials, authContext: isolatedAuthContext });
  installStaticCodexOAuth(models);
  singleton = models;
  return singleton;
}

export function getModelsRuntime(): MutableModels {
  if (!singleton) {
    throw new Error('modelsRuntime: not initialized; call initModelsRuntime at startup before use');
  }
  return singleton;
}

export function setModelsRuntimeForTests(models: MutableModels | null): void {
  singleton = models;
}

function envCredentialStore(): CredentialStore {
  const read = async (provider: string) => {
    if (provider === CODEX_PROVIDER) {
      const { readCodexCredential, defaultCodexAuthPath } = await import('../settings/credentialStore.js');
      return readCodexCredential(defaultCodexAuthPath());
    }
    const key = getEnvApiKey(provider, process.env as Record<string, string>);
    return key && key !== '<authenticated>' ? { type: 'api_key' as const, key } : undefined;
  };
  const list = async (): Promise<readonly CredentialInfo[]> => {
    const infos: CredentialInfo[] = [];
    for (const provider of [CODEX_PROVIDER, ...SINGLE_KEY_PROVIDERS]) {
      const credential = await read(provider);
      if (credential) infos.push({ providerId: provider, type: credential.type });
    }
    return infos;
  };
  return {
    read,
    list,
    modify: async (provider, fn) => fn(await read(provider)),
    delete: async () => {},
  };
}

export function ensureModelsRuntimeFromEnv(): MutableModels {
  if (singleton) return singleton;
  return initModelsRuntime(envCredentialStore());
}
