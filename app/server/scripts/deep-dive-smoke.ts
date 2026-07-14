import { exec as nodeExec } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createAgentSession } from "../../packages/core/src/ai/agentSession.js";
import { deepDiveState, startDeepDive } from "../../packages/core/src/ai/deepDive.js";
import { buildSystemPrompt, buildTools } from "../../packages/core/src/ai/deepDiveTools.js";
import { initAiSettings } from "../../packages/core/src/ai/initAiSettings.js";
import { aiConfig } from "../../packages/core/src/ai/models.js";
import { getDb } from "../../packages/core/src/db/index.js";
import { loadDotenv } from "../src/dotenv.js";
import { PROJECT_ROOT } from "../../packages/core/src/env.js";
import { loadSkillIndex, readSkill } from "../../packages/core/src/services/skills.js";

const nodeExecAsync = promisify(nodeExec);

const WARNING = [
  "=".repeat(70),
  "WARNING: this script makes a REAL model call against a REAL provider.",
  "It costs REAL money. Default mode uses one tiny prompt; --full mode",
  "runs the entire six-lens deep-dive flow (minutes, real cost).",
  "=".repeat(70),
].join("\n");

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function usage(): never {
  fail("usage: vite-node scripts/deep-dive-smoke.ts <SYMBOL> [--full]");
}

async function runDefaultMode(symbol: string): Promise<void> {
  const index = loadSkillIndex([join(PROJECT_ROOT, ".claude", "skills")]);
  console.log(`\nskill index: ${index.length} skills loaded`);
  const hasDeepDive = index.some((s) => s.name === "stock-deep-dive");
  if (!hasDeepDive) fail("stock-deep-dive skill not found in .claude/skills index");
  console.log("stock-deep-dive: present");

  const skillText = readSkill(index, "stock-deep-dive");
  if (!skillText) fail("readSkill(stock-deep-dive) returned null despite being in the index");
  console.log(`\nstock-deep-dive SKILL.md (first 500 chars):\n${skillText.slice(0, 500)}`);

  const model = aiConfig().deepDiveModel;
  console.log(`\ndeep dive model: ${model ? `${model.provider}/${model.id}` : "未配置"}`);
  if (!model) fail("深度研究模型未配置；请在 /settings 配置");

  const tmpStocksDir = await mkdtemp(join(tmpdir(), "deep-dive-smoke-"));
  console.log(`\ntemp stocks dir (note writes land here, NOT the real stocks/): ${tmpStocksDir}`);

  const toolCalls: string[] = [];
  const exec = async (command: string) => {
    const { stdout, stderr } = await nodeExecAsync(command, { cwd: PROJECT_ROOT });
    return { stdout, stderr };
  };

  const tools = buildTools(PROJECT_ROOT, symbol, exec, tmpStocksDir);
  const wrappedTools = tools.map((tool) => ({
    ...tool,
    execute: async (...args: Parameters<typeof tool.execute>) => {
      const params = args[1] as { command?: string };
      toolCalls.push(tool.name === "bash" && params.command ? `bash: ${params.command}` : tool.name);
      return tool.execute(...args);
    },
  }));

  const systemPrompt = buildSystemPrompt(PROJECT_ROOT, skillText);
  const session = createAgentSession({
    layer: "analyst",
    symbol,
    origin: "deep-dive-smoke",
    model,
    systemPrompt,
    tools: wrappedTools,
  });

  const smokePrompt = [
    `This is a smoke test for symbol ${symbol}. Do exactly these steps in order, then stop:`,
    '1. Call read_skill with name "stock-deep-dive".',
    '2. Call bash with command "echo smoke-ok".',
    '3. Call write_note with a one-line content, e.g. "smoke test note".',
    "Do not do anything else. Do not attempt a real six-lens research pass.",
  ].join("\n");

  const startedAt = Date.now();
  await session.agent.prompt(smokePrompt);
  const elapsedMs = Date.now() - startedAt;

  console.log(`\ntool calls observed (in order):`);
  for (const call of toolCalls) console.log(`  - ${call}`);

  const notePath = join(tmpStocksDir, `${symbol}.md`);
  try {
    const written = await readFile(notePath, "utf8");
    console.log(`\nnote written to temp dir (${notePath}):\n${written}`);
  } catch {
    console.log(`\nno note was written to ${notePath}`);
  }

  console.log(`\nelapsed: ${elapsedMs}ms`);
  console.log(
    "\nabort() path: NOT exercised in this run. It is covered by unit tests " +
      "(app/server/test/deepDive.test.ts, timeout case). This smoke run's job is " +
      "only to verify the real-model tool-calling path end to end.",
  );

  await rm(tmpStocksDir, { recursive: true, force: true });
}

async function runFullMode(symbol: string): Promise<void> {
  console.log(`\n--full mode: running the real production startDeepDive("${symbol}") against the real stocks/ dir.`);
  console.log("This runs the entire six-lens flow and can take several minutes.");

  const result = startDeepDive(symbol);
  if (!result.started) {
    fail(
      result.reason === "disabled"
        ? "deep dive disabled: 深度研究模型未配置；请在 /settings 配置"
        : `deep dive did not start: ${result.reason}`,
    );
  }

  let lastPrinted = "";
  for (;;) {
    await new Promise((r) => setTimeout(r, 15_000));
    const state = deepDiveState();
    const line = JSON.stringify(state);
    if (line !== lastPrinted) {
      console.log(`[${new Date().toISOString()}] state: ${line}`);
      lastPrinted = line;
    }
    if (!state.running) break;
  }

  const state = deepDiveState();
  console.log(`\nlastResult: ${JSON.stringify(state.lastResult, null, 2)}`);

  if (state.lastResult) {
    const notePath = join(PROJECT_ROOT, "stocks", `${state.lastResult.symbol}.md`);
    try {
      const content = await readFile(notePath, "utf8");
      const tail = content.slice(-1000);
      console.log(`\nnote tail (last 1000 chars, ${notePath}):\n${tail}`);
    } catch (err) {
      console.log(`\ncould not read note at ${notePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function main(): Promise<void> {
  console.log(WARNING);

  const args = process.argv.slice(2);
  const full = args.includes("--full");
  const symbol = args.find((a) => !a.startsWith("--"));
  if (!symbol) usage();

  loadDotenv();
  initAiSettings(getDb());

  if (full) {
    await runFullMode(symbol);
    return;
  }
  await runDefaultMode(symbol);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
