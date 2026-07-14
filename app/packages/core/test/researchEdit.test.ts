import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../src/db/index.js";
import {
  applyResearchEditProposal,
  createResearchEditProposal,
  listResearchEditProposals,
  undoResearchEditProposal,
} from "../src/modules/research/researchEdit.service.js";

let root: string;
let db: Db;

function write(path: string, content: string): void {
  const absolute = join(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "research-edit-test-"));
  db = createDb(":memory:");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("research edit policy", () => {
  it("applies only the stock-note operations selected by the user", async () => {
    write("stocks/MU.md", "# MU\n\n## 论点\n旧判断。\n");
    const proposal = await createResearchEditProposal(
      {
        sessionId: "session-1",
        path: "stocks/MU.md",
        summary: "更新论点并补充风险",
        operations: [
          { type: "replace", oldText: "旧判断。", newText: "新判断。" },
          { type: "append", content: "## 风险\n库存继续上升。" },
        ],
      },
      { rootDir: root, db },
    );

    const result = await applyResearchEditProposal(
      { id: proposal.id, path: proposal.path, operationIndexes: [1] },
      { rootDir: root, db },
    );

    expect(result.document.markdown).toBe("# MU\n\n## 论点\n旧判断。\n\n## 风险\n库存继续上升。\n");
    expect(result.proposal.status).toBe("applied");
    expect(result.proposal.appliedOperationIndexes).toEqual([1]);
  });

  it("keeps journals append-only", async () => {
    write("journal/2026-07-14-MU.md", "# MU 日志\n\n原始判断。\n");

    await expect(
      createResearchEditProposal(
        {
          sessionId: "session-2",
          path: "journal/2026-07-14-MU.md",
          summary: "改写历史判断",
          operations: [{ type: "replace", oldText: "原始判断。", newText: "新判断。" }],
        },
        { rootDir: root, db },
      ),
    ).rejects.toMatchObject({ message: "journal documents are append-only" });

    const proposal = await createResearchEditProposal(
      {
        sessionId: "session-2",
        path: "journal/2026-07-14-MU.md",
        summary: "追加后续验证",
        operations: [{ type: "append", content: "## 14:30 后续验证\n原始判断未成立。" }],
      },
      { rootDir: root, db },
    );
    const result = await applyResearchEditProposal({ id: proposal.id, path: proposal.path }, { rootDir: root, db });

    expect(result.document.markdown).toContain("原始判断。\n\n## 14:30 后续验证");
  });

  it("marks a proposal stale instead of overwriting an external edit", async () => {
    write("stocks/MU.md", "# MU\n\n旧判断。\n");
    const proposal = await createResearchEditProposal(
      {
        sessionId: "session-3",
        path: "stocks/MU.md",
        summary: "更新判断",
        operations: [{ type: "replace", oldText: "旧判断。", newText: "AI 判断。" }],
      },
      { rootDir: root, db },
    );
    write("stocks/MU.md", "# MU\n\n用户刚刚修改。\n");

    await expect(
      applyResearchEditProposal({ id: proposal.id, path: proposal.path }, { rootDir: root, db }),
    ).rejects.toMatchObject({ status: 409, code: "research_revision_conflict" });
    expect(readFileSync(join(root, "stocks/MU.md"), "utf8")).toContain("用户刚刚修改");
    expect((await listResearchEditProposals(proposal.path, { db }))[0].status).toBe("stale");
  });

  it("refuses to create a proposal from a stale research-task revision", async () => {
    write("stocks/MU.md", "# MU\n\n用户刚刚更新的判断。\n");

    await expect(
      createResearchEditProposal(
        {
          sessionId: "refresh-task-1",
          path: "stocks/MU.md",
          summary: "基于旧版本生成的提案",
          operations: [{ type: "append", content: "## 验证\n旧版本验证条件。" }],
          expectedRevision: "outdated-revision",
        },
        { rootDir: root, db },
      ),
    ).rejects.toMatchObject({ status: 409, code: "research_revision_conflict" });
    expect(await listResearchEditProposals("stocks/MU.md", { db })).toHaveLength(0);
  });

  it("undoes an applied edit only while the applied revision is still current", async () => {
    const original = "# MU\n\n旧判断。\n";
    write("stocks/MU.md", original);
    const proposal = await createResearchEditProposal(
      {
        sessionId: "session-4",
        path: "stocks/MU.md",
        summary: "更新判断",
        operations: [{ type: "replace", oldText: "旧判断。", newText: "新判断。" }],
      },
      { rootDir: root, db },
    );
    const applied = await applyResearchEditProposal({ id: proposal.id, path: proposal.path }, { rootDir: root, db });
    expect(applied.document.markdown).toContain("新判断");

    const undone = await undoResearchEditProposal({ id: proposal.id, path: proposal.path }, { rootDir: root, db });
    expect(undone.proposal.status).toBe("undone");
    expect(undone.document.markdown).toBe(original);
  });
});
