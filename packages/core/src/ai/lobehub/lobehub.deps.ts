import type { MutableModels } from '@earendil-works/pi-ai';
import type { LobeHubCloudGateway } from './types.js';
import { getAiRuntime } from '../settings/initAiSettings.js';
import { getModelsRuntime } from '../runtime/modelsRuntime.js';

export interface LobeHubDeps {
  gateway: LobeHubCloudGateway;
  models: Pick<MutableModels, 'refresh'>;
}

let testDeps: LobeHubDeps | null = null;

export function setLobeHubDepsForTests(overrides: LobeHubDeps | null): void {
  testDeps = overrides;
}

export function lobehubDeps(): LobeHubDeps {
  return (
    testDeps ?? {
      gateway: getAiRuntime().lobehub,
      models: getModelsRuntime(),
    }
  );
}
