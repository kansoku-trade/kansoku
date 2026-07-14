import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AiAgentFactory } from "../src/ai/agentSession.js";
import type { AiModel } from "../src/ai/models.js";
import { abortResearchRefresh, getLatestResearchRefreshTask, startResearchRefresh } from "../src/ai/researchRefresh.js";
import { createDb, type Db } from "../src/db/index.js";
import { listResearchEditProposals } from "../src/modules/research/researchEdit.service.js";

const model = { provider: "anthropic", id: "test-model" } as unknown as AiModel;
let root: string;
let db: Db;

function write(path: string, content: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

function createFactory(evidenceId: string): AiAgentFactory {
  return (config) => {
    const state = { messages: [...(config.messages ?? [])] as AgentMessage[] };
    return {
      prompt: async (text) => {
        state.messages.push({ role: "user", content: text, timestamp: Date.now() });
        const submit = config.tools.find((tool) => tool.name === "submit_research_refresh");
        if (!submit) throw new Error("missing submit tool");
        await submit.execute("submit-1", {
          summary: "HBM 需求仍强，但需要通过库存与合约价格持续验证。",
          findings: [
            {
              title: "核心论点仍然成立",
              assessment: "当前文档的主要判断可保留，但验证条件不够明确。",
              confidence: "medium",
              evidence_ids: [evidenceId],
            },
          ],
          risks: [],
          open_questions: ["下季度库存周转是否继续改善？"],
          edit_proposal: {
            summary: "补充核心论点的验证条件",
            operations: [
              {
                type: "replace",
                oldText: "HBM 需求仍然强劲。",
                newText: "HBM 需求仍然强劲，但需要通过库存周转与合约价格持续验证。",
              },
            ],
          },
        });
      },
      abort: () => undefined,
      state,
    };
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "research-refresh-test-"));
  db = createDb(":memory:");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("research refresh", () => {
  it("persists an evidence-backed report and a reviewable edit without changing the document", async () => {
    write("stocks/MU.md", "# MU\n\n## 核心论点\n\nHBM 需求仍然强劲。\n");
    const result = await startResearchRefresh(
      { path: "stocks/MU.md" },
      {
        model,
        rootDir: root,
        db,
        agentFactory: createFactory("doc-current"),
        disciplineText: "# trading-discipline\n测试纪律。",
        buildPack: async () => {
          throw new Error("market tool should not run");
        },
        fetchNews: async () => [],
      },
    );
    await result.done;

    const task = await getLatestResearchRefreshTask("stocks/MU.md", db);
    expect(task).toMatchObject({ status: "completed", phase: "completed" });
    expect(task?.report?.findings[0]).toMatchObject({ evidenceIds: ["doc-current"], confidence: "medium" });
    expect(task?.report?.evidence).toEqual([
      expect.objectContaining({ id: "doc-current", kind: "document", locator: "stocks/MU.md" }),
    ]);
    expect(task?.report?.proposalId).toBeTruthy();
    const proposals = await listResearchEditProposals("stocks/MU.md", { db });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ status: "pending", summary: "补充核心论点的验证条件" });
    expect(readFileSync(join(root, "stocks/MU.md"), "utf8")).toContain("HBM 需求仍然强劲。\n");
  });

  it("rejects fabricated evidence references instead of saving an unauditable report", async () => {
    write("stocks/MU.md", "# MU\n\nHBM 需求仍然强劲。\n");
    const result = await startResearchRefresh(
      { path: "stocks/MU.md" },
      {
        model,
        rootDir: root,
        db,
        agentFactory: createFactory("invented-source"),
        disciplineText: "# trading-discipline\n测试纪律。",
        buildPack: async () => {
          throw new Error("market tool should not run");
        },
        fetchNews: async () => [],
      },
    );
    await result.done;

    const task = await getLatestResearchRefreshTask("stocks/MU.md", db);
    expect(task).toMatchObject({ status: "failed", error: "agent finished without submitting a research refresh report" });
    expect(await listResearchEditProposals("stocks/MU.md", { db })).toHaveLength(0);
  });

  it("stops an active task without producing a report or proposal", async () => {
    write("stocks/MU.md", "# MU\n\nHBM 需求仍然强劲。\n");
    let release: (() => void) | undefined;
    const agentFactory: AiAgentFactory = () => ({
      prompt: () => new Promise<void>((resolve) => {
        release = resolve;
      }),
      abort: () => release?.(),
      state: { messages: [] },
    });
    const result = await startResearchRefresh(
      { path: "stocks/MU.md" },
      {
        model,
        rootDir: root,
        db,
        agentFactory,
        disciplineText: "# trading-discipline\n测试纪律。",
      },
    );

    const aborted = await abortResearchRefresh("stocks/MU.md", db);
    expect(aborted.status).toBe("aborted");
    await result.done;
    const task = await getLatestResearchRefreshTask("stocks/MU.md", db);
    expect(task).toMatchObject({ status: "aborted", report: null });
    expect(await listResearchEditProposals("stocks/MU.md", { db })).toHaveLength(0);
  });
});
