import type { MutableModels } from "@earendil-works/pi-ai";
import type { LobeHubCloudGateway } from "../../ai/lobehub/types.js";
import { getAiRuntime } from "../../ai/initAiSettings.js";
import { getModelsRuntime } from "../../ai/modelsRuntime.js";

export interface LobeHubDeps {
  gateway: LobeHubCloudGateway;
  models: Pick<MutableModels, "refresh">;
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
