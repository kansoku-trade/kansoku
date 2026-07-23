import type {
  AnalystSections,
  ContextSection,
  ReassessPhase,
  ReassessStatus,
  TechnicalSection,
} from '../../../contract/symbols.js';
import { createRunLock } from '../../agents/runLock.js';
import type { RunningAnalystRunStatus } from './types.js';

const MAX_ACTIVITIES = 50;

const ESCALATION_COOLDOWN_MS = 30 * 60_000;

const analystRunLock = createRunLock();
const analystRunStates = new Map<string, RunningAnalystRunStatus>();
const lastEscalationStart = new Map<string, number>();
const analystRunListeners = new Set<(symbol: string, status: ReassessStatus) => void>();

export function analystRunStatus(symbol: string): ReassessStatus {
  if (!analystRunLock.isLocked(symbol)) return { running: false };
  return analystRunStates.get(symbol) ?? { running: false };
}

export function listAnalystRuns(): Array<{ symbol: string; status: RunningAnalystRunStatus }> {
  return [...analystRunStates.entries()].map(([symbol, status]) => ({ symbol, status }));
}

export function onAnalystRunChange(
  listener: (symbol: string, status: ReassessStatus) => void,
): () => void {
  analystRunListeners.add(listener);
  return () => analystRunListeners.delete(listener);
}

function emitAnalystRunChange(symbol: string, status: ReassessStatus): void {
  for (const listener of analystRunListeners) {
    try {
      listener(symbol, status);
    } catch {
      continue;
    }
  }
}

function updateAnalystRunStatus(
  symbol: string,
  phase: ReassessPhase,
  activity: string,
  now: () => number,
): void {
  const current = analystRunStates.get(symbol);
  if (!current) return;
  const next: RunningAnalystRunStatus = {
    ...current,
    phase,
    activity,
    updatedAt: new Date(now()).toISOString(),
  };
  analystRunStates.set(symbol, next);
  emitAnalystRunChange(symbol, next);
}

export function appendAnalystActivity(symbol: string, text: string, now: () => number): void {
  const current = analystRunStates.get(symbol);
  if (!current) return;
  const at = new Date(now()).toISOString();
  const activities = [...(current.activities ?? []), { at, text }].slice(-MAX_ACTIVITIES);
  const next: RunningAnalystRunStatus = { ...current, activities, updatedAt: at };
  analystRunStates.set(symbol, next);
  emitAnalystRunChange(symbol, next);
}

export function setAnalystSection(
  symbol: string,
  section: { kind: 'technical'; data: TechnicalSection } | { kind: 'context'; data: ContextSection },
  now: () => number,
): void {
  const current = analystRunStates.get(symbol);
  if (!current) return;
  const sections: AnalystSections = { ...current.sections };
  if (section.kind === 'technical') sections.technical = section.data;
  else sections.context = section.data;
  const next: RunningAnalystRunStatus = {
    ...current,
    sections,
    updatedAt: new Date(now()).toISOString(),
  };
  analystRunStates.set(symbol, next);
  emitAnalystRunChange(symbol, next);
}

export function escalationOnCooldown(symbol: string, now: number): boolean {
  for (const [key, ts] of lastEscalationStart) {
    if (now - ts >= ESCALATION_COOLDOWN_MS) lastEscalationStart.delete(key);
  }
  const last = lastEscalationStart.get(symbol);
  return last != null && now - last < ESCALATION_COOLDOWN_MS;
}

export {
  analystRunLock,
  analystRunStates,
  lastEscalationStart,
  emitAnalystRunChange,
  updateAnalystRunStatus,
};
