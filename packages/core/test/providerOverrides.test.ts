import type {
  Api,
  AssistantMessageEventStream,
  Context,
  Model,
  Provider,
} from '@earendil-works/pi-ai';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyBaseUrlOverride,
  resetProviderOverridesForTests,
} from '../src/ai/runtime/providerOverrides.js';

const RELAY = 'https://relay.example/v1';

describe('applyBaseUrlOverride', () => {
  let models: ReturnType<typeof builtinModels>;

  beforeEach(() => {
    resetProviderOverridesForTests();
    models = builtinModels();
  });

  it('rewrites the provider and every model baseUrl while keeping the api', () => {
    const officialApis = models.getModels('deepseek').map((model) => model.api);

    applyBaseUrlOverride(models, 'deepseek', RELAY);

    expect(models.getProvider('deepseek')?.baseUrl).toBe(RELAY);
    const overridden = models.getModels('deepseek');
    expect(overridden.length).toBeGreaterThan(0);
    expect(overridden.map((model) => model.baseUrl)).toEqual(overridden.map(() => RELAY));
    expect(overridden.map((model) => model.api)).toEqual(officialApis);
  });

  it('moves openai models onto the completions api without the responses compat block', () => {
    expect(models.getModels('openai').every((model) => model.api === 'openai-responses')).toBe(
      true,
    );

    applyBaseUrlOverride(models, 'openai', RELAY);

    expect(models.getProvider('openai')?.baseUrl).toBe(RELAY);
    const overridden = models.getModels('openai');
    expect(overridden.length).toBeGreaterThan(0);
    for (const model of overridden) {
      expect(model.api).toBe('openai-completions');
      expect(model.baseUrl).toBe(RELAY);
      expect('compat' in model).toBe(false);
    }
  });

  it('strips trailing slashes and surrounding whitespace', () => {
    applyBaseUrlOverride(models, 'deepseek', '  https://relay.example/v1//  ');

    expect(models.getProvider('deepseek')?.baseUrl).toBe(RELAY);
    expect(models.getModels('deepseek').every((model) => model.baseUrl === RELAY)).toBe(true);
  });

  it('rebuilds from the original provider and restores it on null', () => {
    const officialDeepseek = models.getProvider('deepseek')?.baseUrl;
    const officialOpenai = models.getProvider('openai')?.baseUrl;

    applyBaseUrlOverride(models, 'deepseek', RELAY);
    applyBaseUrlOverride(models, 'deepseek', 'https://second.example/v1');
    applyBaseUrlOverride(models, 'openai', RELAY);
    applyBaseUrlOverride(models, 'openai', 'https://second.example/v1');

    expect(models.getProvider('deepseek')?.baseUrl).toBe('https://second.example/v1');
    expect(models.getProvider('openai')?.baseUrl).toBe('https://second.example/v1');

    applyBaseUrlOverride(models, 'deepseek', null);
    applyBaseUrlOverride(models, 'openai', null);

    expect(models.getProvider('deepseek')?.baseUrl).toBe(officialDeepseek);
    expect(models.getModels('deepseek').every((model) => model.baseUrl === officialDeepseek)).toBe(
      true,
    );
    expect(models.getProvider('openai')?.baseUrl).toBe(officialOpenai);
    expect(models.getModels('openai').every((model) => model.api === 'openai-responses')).toBe(
      true,
    );
    expect(models.getModels('openai').every((model) => model.baseUrl === officialOpenai)).toBe(
      true,
    );
  });

  it('ignores an unknown provider and a null for a provider that was never overridden', () => {
    expect(() => applyBaseUrlOverride(models, 'not-a-provider', RELAY)).not.toThrow();
    expect(models.getProvider('not-a-provider')).toBeUndefined();
    expect(() => applyBaseUrlOverride(models, 'deepseek', null)).not.toThrow();
    expect(models.getProvider('deepseek')?.baseUrl).toBe('https://api.deepseek.com');
  });

  it('delegates streaming back to the original provider', () => {
    const calls: string[] = [];
    const stub = {} as AssistantMessageEventStream;
    const fake: Provider = {
      id: 'fake',
      name: 'Fake',
      baseUrl: 'https://fake.example',
      auth: { apiKey: { name: 'Fake API key', resolve: async () => undefined } },
      getModels: () => [],
      stream: () => {
        calls.push('stream');
        return stub;
      },
      streamSimple: () => {
        calls.push('streamSimple');
        return stub;
      },
    };
    models.setProvider(fake);

    applyBaseUrlOverride(models, 'fake', RELAY);

    const provider = models.getProvider('fake');
    const model = { id: 'm', baseUrl: RELAY } as Model<Api>;
    const context = {} as Context;
    expect(provider?.stream(model, context)).toBe(stub);
    expect(provider?.streamSimple(model, context)).toBe(stub);
    expect(calls).toEqual(['stream', 'streamSimple']);
  });
});
