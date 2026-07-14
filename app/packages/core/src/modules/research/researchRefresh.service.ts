import {
  abortResearchRefresh,
  getLatestResearchRefreshTask,
  recoverInterruptedResearchRefresh,
  type ResearchRefreshDeps,
  startResearchRefresh,
} from "../../ai/researchRefresh.js";
import { aiConfig } from "../../ai/models.js";
import type { ResearchApi } from "../../contract/research.js";
import { researchService } from "./research.service.js";

type ResearchRefreshApi = Pick<ResearchApi, "getRefresh" | "startRefresh" | "abortRefresh">;

let testDeps: ResearchRefreshDeps | null = null;

export function setResearchRefreshDepsForTests(deps: ResearchRefreshDeps | null): void {
  testDeps = deps;
}

function buildDeps(): ResearchRefreshDeps {
  return testDeps ?? { model: aiConfig().deepDiveModel };
}

export const researchRefreshService: ResearchRefreshApi = {
  async getRefresh(input) {
    const document = await researchService.get({ path: input.path });
    const deps = buildDeps();
    return recoverInterruptedResearchRefresh(document.path, deps.db, deps.now);
  },

  async startRefresh(input) {
    const result = await startResearchRefresh(input, buildDeps());
    result.done.catch((error) => console.error("research refresh: background task failed", error));
    return result.task;
  },

  async abortRefresh(input) {
    const deps = buildDeps();
    const document = await researchService.get({ path: input.path });
    return abortResearchRefresh(document.path, deps.db, deps.now);
  },
};

export { getLatestResearchRefreshTask };
