import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createResearchService } from "../src/modules/research/research.service.js";

let root: string;

function write(relativePath: string, content: string): void {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "research-service-test-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("research library listing", () => {
  it("presents stock notes and heterogeneous journal records through one metadata model", async () => {
    write("stocks/MU.md", "# MU 长期研究\n\n库存和 HBM 是当前验证重点。\n");
    write("journal/2026-07-14-MU-intraday.md", "## MU 短线重估\n\n保留当时判断。\n");
    write("journal/2026-07-09-intraday-recap.md", "# 盘中自动小结\n\n## NVDA.US\n上涨。\n\n## MSFT.US\n震荡。\n");
    write("journal/lessons.md", "# 交易教训清单\n\n- 不追逐未经确认的突破。\n");
    write("journal/charts/data/ignored.json", "{}");

    const rows = await createResearchService(root).list({});

    expect(rows.map((row) => row.path)).toEqual([
      "stocks/MU.md",
      "journal/2026-07-14-MU-intraday.md",
      "journal/2026-07-09-intraday-recap.md",
      "journal/lessons.md",
    ]);
    expect(rows.find((row) => row.path === "stocks/MU.md")).toMatchObject({
      kind: "stock",
      type: "stock",
      title: "MU 长期研究",
      symbols: ["MU"],
      excerpt: "库存和 HBM 是当前验证重点。",
    });
    expect(rows.find((row) => row.path.endsWith("intraday-recap.md"))).toMatchObject({
      kind: "journal",
      type: "recap",
      symbols: ["MSFT", "NVDA"],
    });
    expect(rows.find((row) => row.path === "journal/lessons.md")).toMatchObject({
      type: "lessons",
      date: null,
    });
  });

  it("searches full markdown text without returning the markdown body in list rows", async () => {
    write("stocks/MU.md", "# MU\n\n正文中包含独有词：供给纪律。\n");
    write("stocks/NVDA.md", "# NVDA\n\n计算平台。\n");

    const rows = await createResearchService(root).list({ kind: "stock", query: "供给纪律" });

    expect(rows).toHaveLength(1);
    expect(rows[0].path).toBe("stocks/MU.md");
    expect(rows[0]).not.toHaveProperty("markdown");
  });

  it("discovers nested journal markdown while ignoring symlinks", async () => {
    write("journal/decisions/2026-07-14-MU.md", "# MU 决策\n");
    write("outside.md", "# 不应读取\n");
    mkdirSync(join(root, "journal", "linked"), { recursive: true });
    symlinkSync(join(root, "outside.md"), join(root, "journal", "linked", "outside.md"));

    const rows = await createResearchService(root).list({ kind: "journal" });

    expect(rows.map((row) => row.path)).toEqual(["journal/decisions/2026-07-14-MU.md"]);
    expect(rows[0].type).toBe("decision");
  });

  it("rejects unknown views at the shared service boundary used by HTTP and IPC", async () => {
    const service = createResearchService(root);
    await expect(service.list({ kind: "other" as "stock" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("research document loading", () => {
  it("loads the selected markdown with the same metadata used by the list", async () => {
    write("journal/2026-07-14-MU-intraday.md", "# MU 复盘\n\n正文。\n");

    const document = await createResearchService(root).get({ path: "journal/2026-07-14-MU-intraday.md" });

    expect(document).toMatchObject({
      path: "journal/2026-07-14-MU-intraday.md",
      kind: "journal",
      title: "MU 复盘",
      markdown: "# MU 复盘\n\n正文。\n",
    });
    expect(document.revision).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects traversal and symlink escape paths", async () => {
    write("outside.md", "secret");
    mkdirSync(join(root, "journal"), { recursive: true });
    symlinkSync(join(root, "outside.md"), join(root, "journal", "outside.md"));
    const service = createResearchService(root);

    await expect(service.get({ path: "../outside.md" })).rejects.toMatchObject({ status: 400 });
    await expect(service.get({ path: "journal/outside.md" })).rejects.toMatchObject({ status: 404 });
  });
});
