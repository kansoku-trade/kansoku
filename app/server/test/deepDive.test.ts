import { promises as fs } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type DeepDiveAgent,
  type DeepDiveAgentFactory,
  type DeepDiveDeps,
  deepDiveState,
  resetDeepDiveStateForTests,
  startDeepDive,
} from "../src/ai/deepDive.js";
import type { AiModel } from "../src/ai/models.js";

const fakeModel = { provider: "anthropic", id: "claude-haiku-4-5" } as unknown as AiModel;

const base = process.env.TMPDIR ?? "/tmp/";
const sep = base.endsWith("/") ? "" : "/";
const repoRoot = `${base}${sep}deep-dive-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

type Tools = Parameters<DeepDiveAgentFactory>[0]["tools"];

function tool(tools: Tools, name: string) {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
}

interface Harness {
  deps: Partial<DeepDiveDeps>;
  notifications: { title: string; message: string }[];
}

function harness(
  script: (tools: Tools) => Promise<void>,
  opts: {
    hang?: boolean;
    onAbort?: () => void;
    timeoutMs?: number;
    exec?: DeepDiveDeps["exec"];
    now?: () => number;
  } = {},
): Harness {
  const notifications: { title: string; message: string }[] = [];

  const agentFactory: DeepDiveAgentFactory = ({ tools }) => {
    const agent: DeepDiveAgent = {
      prompt: opts.hang ? () => new Promise<void>(() => {}) : () => script(tools),
      abort: () => opts.onAbort?.(),
    };
    return agent;
  };

  const deps: Partial<DeepDiveDeps> = {
    model: fakeModel,
    agentFactory,
    notify: (title, message) => {
      notifications.push({ title, message });
    },
    repoRoot,
    timeoutMs: opts.timeoutMs,
    exec: opts.exec,
    now: opts.now,
  };

  return { deps, notifications };
}

beforeEach(async () => {
  resetDeepDiveStateForTests();
  await fs.rm(join(repoRoot, "stocks"), { recursive: true, force: true });
  await fs.mkdir(join(repoRoot, "stocks"), { recursive: true });
  await fs.mkdir(join(repoRoot, ".claude", "skills"), { recursive: true });
});

afterAll(async () => {
  await fs.rm(repoRoot, { recursive: true, force: true });
});

describe("startDeepDive gating", () => {
  it("is disabled when the model env is missing", () => {
    const result = startDeepDive("MU", { model: null });
    expect(result).toEqual({ started: false, reason: "disabled" });
  });

  it("rejects a second start while one is in flight (global mutex)", async () => {
    const { deps } = harness(async () => {}, { hang: true });
    const first = startDeepDive("MU", deps);
    expect(first).toEqual({ started: true });

    const second = startDeepDive("NVDA", deps);
    expect(second).toEqual({ started: false, reason: "busy" });
  });
});

describe("startDeepDive success/failure paths", () => {
  it("updates state and notifies on success", async () => {
    const { deps, notifications } = harness(async (tools) => {
      await tool(tools, "write_note").execute("c1", { content: "# MU notes" });
    });

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    const state = deepDiveState();
    expect(state.lastResult?.symbol).toBe("MU");
    expect(state.lastResult?.ok).toBe(true);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toContain("deep dive complete");

    const written = await fs.readFile(join(repoRoot, "stocks", "MU.md"), "utf8");
    expect(written).toBe("# MU notes");
  });

  it("records a failure when the agent rejects", async () => {
    const agentFactory: DeepDiveAgentFactory = () => ({
      prompt: async () => {
        throw new Error("boom");
      },
      abort: () => {},
    });
    const { deps, notifications } = harness(async () => {});
    deps.agentFactory = agentFactory;

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    const state = deepDiveState();
    expect(state.lastResult?.ok).toBe(false);
    expect(state.lastResult?.error).toContain("boom");
    expect(notifications[0].title).toContain("deep dive failed");
  });

  it("aborts and records a failure past the timeout", async () => {
    let aborted = false;
    const { deps } = harness(async () => {}, {
      hang: true,
      timeoutMs: 10,
      onAbort: () => {
        aborted = true;
      },
    });

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false), { timeout: 2000 });

    expect(aborted).toBe(true);
    const state = deepDiveState();
    expect(state.lastResult?.ok).toBe(false);
    expect(state.lastResult?.error).toContain("timed out");
  });
});

describe("deep-dive tools", () => {
  it("write_note writes only the target symbol file, ignoring any path param", async () => {
    const { deps } = harness(async (tools) => {
      await tool(tools, "write_note").execute("c1", { content: "hello MRVL" });
    });

    startDeepDive("MRVL", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    const written = await fs.readFile(join(repoRoot, "stocks", "MRVL.md"), "utf8");
    expect(written).toBe("hello MRVL");
    const others = await fs.readdir(join(repoRoot, "stocks"));
    expect(others).toEqual(["MRVL.md"]);
  });

  it("write_note honors the stocksDir override instead of repoRoot/stocks", async () => {
    const altDir = join(repoRoot, "alt-stocks");
    const { deps } = harness(async (tools) => {
      await tool(tools, "write_note").execute("c1", { content: "override note" });
    });
    deps.stocksDir = altDir;

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    const written = await fs.readFile(join(altDir, "MU.md"), "utf8");
    expect(written).toBe("override note");
    const real = await fs.readdir(join(repoRoot, "stocks"));
    expect(real).toEqual([]);
  });

  it("bash tool rejects redirection / rm / mv / cp / tee commands", async () => {
    const rejected: string[] = [];
    const { deps } = harness(async (tools) => {
      const bash = tool(tools, "bash");
      for (const command of [
        "echo hi > out.txt",
        "echo hi >> out.txt",
        "rm -rf stocks",
        "mv a b",
        "cp a b",
        "echo hi | tee out.txt",
      ]) {
        const res = await bash.execute("c1", { command });
        rejected.push((res.content[0] as { text: string }).text);
      }
    });

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    expect(rejected).toHaveLength(6);
    for (const text of rejected) {
      expect(text.toLowerCase()).toContain("rejected");
    }
  });

  it("bash tool executes allowed commands via the injected exec", async () => {
    const calls: string[] = [];
    const exec: DeepDiveDeps["exec"] = async (command) => {
      calls.push(command);
      return { stdout: "ok-output", stderr: "" };
    };
    let output = "";
    const { deps } = harness(async (tools) => {
      const res = await tool(tools, "bash").execute("c1", { command: "echo hi" });
      output = (res.content[0] as { text: string }).text;
    }, { exec });

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    expect(calls).toContain("echo hi");
    expect(output).toContain("ok-output");
  });

  it("read_file rejects a traversal escape", async () => {
    let output = "";
    const { deps } = harness(async (tools) => {
      const res = await tool(tools, "read_file").execute("c1", { path: "../../etc/passwd" });
      output = (res.content[0] as { text: string }).text;
    });

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    expect(output.toLowerCase()).toMatch(/reject|invalid|escape/);
  });

  it("read_file reads a repo-relative file", async () => {
    await fs.writeFile(join(repoRoot, "stocks", "MU.md"), "existing note");
    let output = "";
    const { deps } = harness(async (tools) => {
      const res = await tool(tools, "read_file").execute("c1", { path: "stocks/MU.md" });
      output = (res.content[0] as { text: string }).text;
    });

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    expect(output).toBe("existing note");
  });

  it("read_skill returns SKILL.md text for a known skill", async () => {
    const skillDir = join(repoRoot, ".claude", "skills", "stock-deep-dive");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      join(skillDir, "SKILL.md"),
      "---\nname: stock-deep-dive\ndescription: six-lens dive\n---\nBody text",
    );

    let output = "";
    const { deps } = harness(async (tools) => {
      const res = await tool(tools, "read_skill").execute("c1", { name: "stock-deep-dive" });
      output = (res.content[0] as { text: string }).text;
    });

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    expect(output).toContain("Body text");
  });

  it("read_skill returns an error string for an unknown skill", async () => {
    let output = "";
    const { deps } = harness(async (tools) => {
      const res = await tool(tools, "read_skill").execute("c1", { name: "does-not-exist" });
      output = (res.content[0] as { text: string }).text;
    });

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    expect(output.toLowerCase()).toContain("unknown");
  });
});

describe("dirty-tree warning", () => {
  it("flags dirtyWarning when git reports unexpected changes outside the target note", async () => {
    let call = 0;
    const exec: DeepDiveDeps["exec"] = async (command) => {
      call += 1;
      if (command.startsWith("git status")) {
        return { stdout: call === 1 ? "" : " M stocks/OTHER.md\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    };

    const { deps, notifications } = harness(async (tools) => {
      await tool(tools, "write_note").execute("c1", { content: "note" });
    }, { exec });

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    const state = deepDiveState();
    expect(state.lastResult?.dirtyWarning).toBe(true);
    expect(notifications[0].message).toContain("⚠");
  });
});
