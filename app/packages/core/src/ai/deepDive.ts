import { PROJECT_ROOT } from "../env.js";
import { type AiAgentFactory, createAgentSession } from "./agentSession.js";
import { createDefaultExec, type ExecFn, type ExecResult } from "./agentTools.js";
import { buildSystemPrompt, buildTools, DEEP_DIVE_SKILL, loadDeepDiveSkillText } from "./deepDiveTools.js";
import { aiConfig, type AiModel } from "./models.js";
import { emitNotice } from "./notices.js";
import { DisciplineMissingError, loadSharedDiscipline } from "./promptPolicy.js";

const DEFAULT_TIMEOUT_MS = 15 * 60_000;

export type DeepDiveState = {
  running: boolean;
  symbol?: string;
  startedAt?: string;
  lastResult?: { symbol: string; ok: boolean; finishedAt: string; error?: string; dirtyWarning?: boolean };
};

export type { ExecFn, ExecResult };

export interface DeepDiveDeps {
  model: AiModel | null;
  agentFactory?: AiAgentFactory;
  notify?: (title: string, message: string, kind: "deep_dive_done" | "deep_dive_failed") => void;
  repoRoot?: string;
  stocksDir?: string;
  exec?: ExecFn;
  timeoutMs?: number;
  now?: () => number;
  skillText?: string;
  disciplineText?: string;
}

let state: DeepDiveState = { running: false };

export function deepDiveState(): DeepDiveState {
  return state;
}

export function resetDeepDiveStateForTests(): void {
  state = { running: false };
}

async function captureGitStatus(exec: ExecFn): Promise<string> {
  try {
    const { stdout } = await exec("git status --porcelain -- stocks/");
    return stdout;
  } catch {
    return "";
  }
}

function unexpectedDirty(before: string, after: string, symbol: string): boolean {
  const noteLine = `stocks/${symbol}.md`;
  const beforeLines = new Set(before.split("\n").filter(Boolean));
  const afterLines = after.split("\n").filter(Boolean);
  return afterLines.some((line) => !beforeLines.has(line) && !line.includes(noteLine));
}

async function executeDeepDiveRun(symbol: string, deps: DeepDiveDeps): Promise<void> {
  const repoRoot = deps.repoRoot ?? PROJECT_ROOT;
  const notify =
    deps.notify ??
    ((title: string, body: string, kind: "deep_dive_done" | "deep_dive_failed") =>
      emitNotice({ symbol, kind, title, body, at: new Date().toISOString() }));
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const exec = deps.exec ?? createDefaultExec(repoRoot);
  const now = deps.now ?? (() => Date.now());

  const before = await captureGitStatus(exec);

  try {
    if (!deps.model) throw new Error("model not resolved");

    const skillText = deps.skillText ?? loadDeepDiveSkillText(repoRoot);
    if (!skillText) {
      throw new Error(`${DEEP_DIVE_SKILL} SKILL.md 读不到，深度研究中止——纪律缺席时不允许裸跑。`);
    }
    const disciplineText = deps.disciplineText ?? loadSharedDiscipline(repoRoot);
    if (!disciplineText) throw new DisciplineMissingError();

    let noteWritten = false;
    const tools = buildTools(repoRoot, symbol, exec, deps.stocksDir, () => {
      noteWritten = true;
    });
    const systemPrompt = buildSystemPrompt(repoRoot, skillText, disciplineText);
    const session = createAgentSession({
      layer: "analyst",
      symbol,
      origin: "deep-dive",
      model: deps.model,
      systemPrompt,
      tools,
      agentFactory: deps.agentFactory,
    });

    await session.runTurn(`请按 stock-deep-dive 技能流程研究 ${symbol}，完成后写入更新的笔记。`, timeoutMs);

    if (!noteWritten) {
      throw new Error("agent finished without calling write_note — no findings were persisted.");
    }

    const after = await captureGitStatus(exec);
    const dirtyWarning = unexpectedDirty(before, after, symbol);

    state = {
      running: false,
      lastResult: {
        symbol,
        ok: true,
        finishedAt: new Date(now()).toISOString(),
        ...(dirtyWarning ? { dirtyWarning: true } : {}),
      },
    };
    notify(
      `${symbol} deep dive complete`,
      dirtyWarning
        ? "⚠️ note updated, but unexpected changes outside the target note were detected."
        : "note updated.",
      "deep_dive_done",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[deep-dive] ${symbol} failed: ${message}`);
    state = {
      running: false,
      lastResult: { symbol, ok: false, finishedAt: new Date(now()).toISOString(), error: message },
    };
    notify(`${symbol} deep dive failed`, message, "deep_dive_failed");
  }
}

export function startDeepDive(
  symbol: string,
  deps?: Partial<DeepDiveDeps>,
): { started: true } | { started: false; reason: "busy" | "disabled" } {
  if (state.running) return { started: false, reason: "busy" };

  const model = deps && "model" in deps ? deps.model ?? null : aiConfig().deepDiveModel;
  if (!model) return { started: false, reason: "disabled" };

  const now = deps?.now ?? (() => Date.now());
  state = { running: true, symbol, startedAt: new Date(now()).toISOString() };

  void executeDeepDiveRun(symbol, { ...deps, model });
  return { started: true };
}
