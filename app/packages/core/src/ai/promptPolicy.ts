import { skillSearchDirs } from "../env.js";
import type { Market } from "../services/symbol.utils.js";
import { loadSkillIndex, readSkill } from "../services/skills.js";
import { getWatchedMarketsOrDefault } from "../services/watchedMarketsStore.js";

/**
 * Single injection point for the shared trading discipline.
 *
 * Agents are grouped by CAPABILITY, not by how important a rule feels. Whether a rule applies
 * depends on whether the agent has the inputs, tools and outputs to act on it:
 *
 *   judgment   — analyst / deepDive / chat: form conclusions from data. Get the full discipline.
 *                Analyst injects it through its provider-facing MessagesEngine; the other judgment
 *                agents use this module's prompt composer. Fail-closed: no discipline file, no run.
 *   observer   — commentator: narrates observable change on a 60s scheduler. Gets a compact
 *                observer contract instead; the GAAP trap and QoQ rules are pure cost to it.
 *   mechanical — chatSuggestions / eventFilter: emit questions / indices. Constrained by schema
 *                and code, not by prose.
 *
 * Every agent routes through here. A single source file stops the TEXT from drifting; routing
 * every agent through one assembler is what stops the WIRING from drifting.
 *
 * Note: root CLAUDE.md pulls the same file in via Claude Code's `@import` syntax. That mechanism
 * does not exist here — this module reads the skill file itself. Same source, two readers.
 */
export type AgentCapability = "judgment" | "observer" | "mechanical";

export const DISCIPLINE_SKILL = "trading-discipline";

export class DisciplineMissingError extends Error {
  constructor() {
    super(`${DISCIPLINE_SKILL} SKILL.md 读不到，本次运行中止——纪律缺席时不允许裸跑。`);
    this.name = "DisciplineMissingError";
  }
}

export const OBSERVER_CONTRACT = [
  "观察者纪律：",
  "- 只描述输入里能观察到的变化，不臆测原因。看不到成因就只说现象。",
  "- 引用任何数字都要标明它来自哪个时间点的快照。",
  "- 数据不足以支撑判断时，升级交给分析员，不要自己硬猜。",
  "- 中文白话，少用行话；确实要用的术语，紧跟一个方括号白话注解。",
  "- 市场范围跟随配置的关注市场，不臆造数据，拿不到就说明。",
].join("\n");

export function watchedMarketsLine(markets: Market[]): string {
  return `关注市场：${markets.join(" / ")}。全市场级扫描只覆盖这些市场；单标的分析跟随标的所在市场（TD-LANG-03）。`;
}

export function appendWatchedMarketsLine(disciplineText: string): string {
  if (!disciplineText) return disciplineText;
  return [disciplineText, "", watchedMarketsLine(getWatchedMarketsOrDefault())].join("\n");
}

export function loadSharedDiscipline(repoRoot: string): string | null {
  const text = readSkill(loadSkillIndex(skillSearchDirs(repoRoot)), DISCIPLINE_SKILL);
  return text ? appendWatchedMarketsLine(text) : null;
}

/**
 * Returns the discipline text for a capability, or "" when the capability takes none.
 * Throws DisciplineMissingError when a judgment agent cannot load the shared discipline.
 */
export function disciplineFor(capability: AgentCapability, repoRoot: string): string {
  if (capability === "mechanical") return "";
  if (capability === "observer") return OBSERVER_CONTRACT;

  const text = loadSharedDiscipline(repoRoot);
  if (!text) throw new DisciplineMissingError();
  return text;
}

/**
 * The one canonical [discipline, ---, own] join. Callers that receive the discipline text
 * injected (deepDive / chat, for testability) use this directly; withDiscipline
 * resolves the text first and is for callers that own no injection seam.
 */
export function composeWithDiscipline(disciplineText: string, systemPrompt: string): string {
  if (!disciplineText) return systemPrompt;
  return [disciplineText, "", "---", "", systemPrompt].join("\n");
}

/** Prepends the discipline to an agent's own system prompt. */
export function withDiscipline(capability: AgentCapability, repoRoot: string, systemPrompt: string): string {
  return composeWithDiscipline(disciplineFor(capability, repoRoot), systemPrompt);
}
