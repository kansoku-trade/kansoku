import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiAgentFactory, AiAgentHandle } from "../src/ai/agentSession.js";
import { type DeepDiveDeps, deepDiveState, resetDeepDiveStateForTests, startDeepDive } from "../src/ai/deepDive.js";
import type { AiModel } from "../src/ai/models.js";
import type { Notice } from "../../../shared/types.js";
import { onNotice } from "../src/ai/notices.js";

const fakeModel = { provider: "anthropic", id: "claude-haiku-4-5" } as unknown as AiModel;

const base = process.env.TMPDIR ?? "/tmp/";
const sep = base.endsWith("/") ? "" : "/";
const repoRoot = `${base}${sep}deep-dive-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

type Tools = Parameters<AiAgentFactory>[0]["tools"];

function tool(tools: Tools, name: string) {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`missing tool ${name}`);
  return t;
}

interface Harness {
  deps: Partial<DeepDiveDeps>;
  notifications: { title: string; message: string }[];
}

const FAKE_SKILL = "# stock-deep-dive\n假技能全文。";
const FAKE_DISCIPLINE = "# trading-discipline\n假纪律全文。";

function harness(
  script: (tools: Tools) => Promise<void>,
  opts: {
    hang?: boolean;
    onAbort?: () => void;
    timeoutMs?: number;
    exec?: DeepDiveDeps["exec"];
    now?: () => number;
    skillText?: string | null;
    disciplineText?: string | null;
    systemPrompts?: string[];
  } = {},
): Harness {
  const notifications: { title: string; message: string }[] = [];

  const agentFactory: AiAgentFactory = ({ tools, systemPrompt }) => {
    opts.systemPrompts?.push(systemPrompt);
    const agent: AiAgentHandle = {
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
    ...("skillText" in opts ? (opts.skillText == null ? {} : { skillText: opts.skillText }) : { skillText: FAKE_SKILL }),
    ...("disciplineText" in opts
      ? opts.disciplineText == null
        ? {}
        : { disciplineText: opts.disciplineText }
      : { disciplineText: FAKE_DISCIPLINE }),
  };

  return { deps, notifications };
}

/** write_note is now a success gate — a run that never calls it fails. */
async function writeNote(tools: Tools, content = "note"): Promise<void> {
  await tool(tools, "write_note").execute("c1", { content });
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
  it("fails the run when the agent never calls write_note", async () => {
    const { deps } = harness(async () => {
      // agent does its research and then just... stops. Previously this counted as success.
    });

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    expect(deepDiveState().lastResult?.ok).toBe(false);
    expect(deepDiveState().lastResult?.error).toContain("write_note");
  });

  it("fails the run when the shared discipline is unreachable", async () => {
    const { deps } = harness(async (tools) => writeNote(tools), { disciplineText: null });

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    expect(deepDiveState().lastResult?.ok).toBe(false);
    expect(deepDiveState().lastResult?.error).toContain("trading-discipline");
  });

  it("fails the run when the deep-dive skill is unreachable", async () => {
    const { deps } = harness(async (tools) => writeNote(tools), { skillText: null });

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    expect(deepDiveState().lastResult?.ok).toBe(false);
    expect(deepDiveState().lastResult?.error).toContain("stock-deep-dive");
  });

  it("preloads the discipline ahead of the deep-dive skill in the system prompt", async () => {
    const systemPrompts: string[] = [];
    const { deps } = harness(async (tools) => writeNote(tools), { systemPrompts });

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    expect(systemPrompts).toHaveLength(1);
    expect(systemPrompts[0].indexOf("假纪律全文")).toBeLessThan(systemPrompts[0].indexOf("假技能全文"));
  });

  it("no longer embeds the skill-index listing in the system prompt", async () => {
    const systemPrompts: string[] = [];
    const { deps } = harness(async (tools) => writeNote(tools), { systemPrompts });

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    expect(systemPrompts).toHaveLength(1);
    expect(systemPrompts[0]).not.toContain("可用技能列表");
    expect(systemPrompts[0]).toContain("假纪律全文");
    expect(systemPrompts[0]).toContain("假技能全文");
  });

  it("wires transformContext to inject the skill catalog as runtime context", async () => {
    const skillDir = join(repoRoot, ".claude", "skills", "foo");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(join(skillDir, "SKILL.md"), "---\nname: foo\ndescription: 演示技能\n---\nfoo body");

    let capturedTransform: ((messages: AgentMessage[]) => Promise<AgentMessage[]>) | undefined;
    const agentFactory: AiAgentFactory = ({ tools, transformContext }) => {
      capturedTransform = transformContext;
      const agent: AiAgentHandle = {
        prompt: () => writeNote(tools),
        abort: () => {},
      };
      return agent;
    };
    const { deps } = harness(async () => {});
    deps.agentFactory = agentFactory;

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    if (!capturedTransform) throw new Error("missing transformContext");
    const viewed = await capturedTransform([{ role: "user", content: "hi", timestamp: 0 }]);
    const text = JSON.stringify(viewed);
    expect(text).toContain("<available_skills>");
    expect(text).toContain("foo");
  });

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

  it("emits a .US-suffixed notice via the default notify path", async () => {
    const { deps } = harness(async (tools) => {
      await tool(tools, "write_note").execute("c1", { content: "# MU notes" });
    });
    delete deps.notify;

    const received: Notice[] = [];
    const unsub = onNotice("MU.US", (n) => received.push(n));

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    unsub();
    expect(received).toHaveLength(1);
    expect(received[0].symbol).toBe("MU.US");
    expect(received[0].kind).toBe("deep_dive_done");
  });

  it("records a failure when the agent rejects", async () => {
    const agentFactory: AiAgentFactory = () => ({
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
  it("exposes read_skill, bash, read_file, write_note with write_note last", async () => {
    let names: string[] = [];
    const { deps } = harness(async (tools) => {
      names = tools.map((t) => t.name);
      await writeNote(tools);
    });

    startDeepDive("MU", deps);
    await vi.waitFor(() => expect(deepDiveState().running).toBe(false));

    expect(names).toEqual(["read_skill", "bash", "read_file", "write_note"]);
  });

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
