import { skillSearchDirs } from '../../platform/env.js';
import type { Market } from '../../symbols/symbol.utils.js';
import { loadSkillIndex, readSkill, type SkillRuntime } from '../agents/skills.js';
import { getWatchedMarketsOrDefault } from '../../marketdata/watchedMarketsStore.js';

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
export type AgentCapability = 'judgment' | 'observer' | 'mechanical';

export const DISCIPLINE_SKILL = 'trading-discipline';

/** App-side composition: SKILL.md core + whatever `references/app/` holds. */
export function loadAppDiscipline(repoRoot: string): string | null {
  return loadDiscipline(repoRoot, 'app');
}

/** Bench-side composition: SKILL.md core + whatever `references/bench/` holds. */
export function loadBenchDiscipline(repoRoot: string): string | null {
  return loadDiscipline(repoRoot, 'bench');
}

function loadDiscipline(repoRoot: string, runtime: SkillRuntime): string | null {
  const index = loadSkillIndex(skillSearchDirs(repoRoot), { repoRoot, runtime });
  const text = readSkill(index, DISCIPLINE_SKILL);
  return text === null ? null : appendWatchedMarketsLine(text);
}

export class DisciplineMissingError extends Error {
  constructor() {
    super(
      `${DISCIPLINE_SKILL} SKILL.md is unavailable; aborting because this agent must not run without its discipline.`,
    );
    this.name = 'DisciplineMissingError';
  }
}

export const OBSERVER_CONTRACT = [
  'Observer discipline:',
  '- Describe only changes observable in the input. Do not infer causes; when a cause is unavailable, state only the observation.',
  '- Attribute every number to the timestamp of the snapshot from which it came.',
  '- When data cannot support a judgment, escalate to the analyst instead of guessing.',
  '- Use plain language and minimize jargon. When a technical term is necessary, immediately explain it in brackets.',
  '- Follow the configured watched markets. Do not invent data; state when it is unavailable.',
].join('\n');

export function watchedMarketsLine(markets: Market[]): string {
  return `Watched markets: ${markets.join(' / ')}. Market-wide scans cover only these markets; single-symbol analysis follows the symbol's market (TD-LANG-03).`;
}

export function appendWatchedMarketsLine(disciplineText: string): string {
  if (!disciplineText) return disciplineText;
  return [disciplineText, '', watchedMarketsLine(getWatchedMarketsOrDefault())].join('\n');
}

/**
 * @deprecated App callers should use `loadAppDiscipline`; bench callers should use
 * `loadBenchDiscipline`. Kept as a thin alias for `loadAppDiscipline` to avoid churn
 * in existing chat / assistantChat call sites during migration.
 */
export function loadSharedDiscipline(repoRoot: string): string | null {
  return loadAppDiscipline(repoRoot);
}

/**
 * Returns the discipline text for a capability, or "" when the capability takes none.
 * Throws DisciplineMissingError when a judgment agent cannot load the shared discipline.
 */
export function disciplineFor(capability: AgentCapability, repoRoot: string): string {
  if (capability === 'mechanical') return '';
  if (capability === 'observer') return OBSERVER_CONTRACT;

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
  return [disciplineText, '', '---', '', systemPrompt].join('\n');
}

/** Prepends the discipline to an agent's own system prompt. */
export function withDiscipline(
  capability: AgentCapability,
  repoRoot: string,
  systemPrompt: string,
): string {
  return composeWithDiscipline(disciplineFor(capability, repoRoot), systemPrompt);
}
