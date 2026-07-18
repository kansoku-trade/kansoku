export interface MentionCandidate {
  path: string;
  title: string;
}

export interface MentionTrigger {
  start: number;
  query: string;
}

const MAX_CANDIDATES = 20;

export function detectMentionTrigger(value: string, cursor: number): MentionTrigger | null {
  const upto = value.slice(0, cursor);
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;
  const between = upto.slice(at + 1);
  if (/[\s@]/.test(between)) return null;
  return { start: at, query: between };
}

export function filterMentionCandidates(candidates: MentionCandidate[], query: string): MentionCandidate[] {
  const trimmed = query.trim().toLowerCase();
  const matches = trimmed
    ? candidates.filter(
        (candidate) => candidate.path.toLowerCase().includes(trimmed) || candidate.title.toLowerCase().includes(trimmed),
      )
    : candidates;
  return matches.slice(0, MAX_CANDIDATES);
}

export interface MentionInsertResult {
  text: string;
  cursor: number;
}

export function insertMention(value: string, cursor: number, trigger: MentionTrigger, path: string): MentionInsertResult {
  const before = value.slice(0, trigger.start);
  const after = value.slice(cursor);
  const inserted = `@${path} `;
  return { text: before + inserted + after, cursor: before.length + inserted.length };
}

export function findMentionedCandidates(value: string, candidates: MentionCandidate[]): MentionCandidate[] {
  const mentionedPaths = new Set(Array.from(value.matchAll(/@([^\s@，。！？、；：,!?;:]+)/g), (match) => match[1]));
  return candidates.filter((candidate) => mentionedPaths.has(candidate.path));
}

export function removeMention(value: string, path: string): string {
  const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mentionPattern = new RegExp(`(^|\\s)@${escapedPath}(?=\\s|$)\\s?`, "g");
  return value.replace(mentionPattern, "$1").replace(/ {2,}/g, " ").trimStart();
}
