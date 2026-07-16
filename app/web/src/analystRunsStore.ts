import { useSyncExternalStore } from "react";
import type { ReassessStatus } from "../../packages/core/src/contract/symbols.js";
import { subscribeChannel } from "./wsHub.js";

export type RunningReassessStatus = Extract<ReassessStatus, { running: true }>;

export interface AnalystRunsSnapshot {
  runs: ReadonlyMap<string, RunningReassessStatus>;
  unseen: ReadonlySet<string>;
}

export type AnalystRunIndicator = readonly [running: boolean, unseen: boolean];

export interface AnalystRunEventState {
  readonly revision: number;
  readonly running: boolean;
}

const NULL_STATUS: RunningReassessStatus | null = null;
const NOOP = () => {};
const NOOP_SUBSCRIBE = () => NOOP;
const INDICATORS = [
  [false, false],
  [false, true],
  [true, false],
  [true, true],
] as const satisfies readonly AnalystRunIndicator[];

let runs = new Map<string, RunningReassessStatus>();
let unseen = new Set<string>();
let snapshot: AnalystRunsSnapshot = { runs, unseen };
const listeners = new Set<() => void>();

let activeSymbol: string | null | undefined;
let unsubscribeChannel: (() => void) | null = null;
let pendingSinceDisconnect = new Set<string>();
let latestEvents = new Map<string, AnalystRunEventState>();
let nextEventRevision = 0;

function emit(): void {
  snapshot = { runs, unseen };
  for (const listener of listeners) listener();
}

function isReassessStatus(value: unknown): value is ReassessStatus {
  if (!value || typeof value !== "object") return false;
  const status = value as Record<string, unknown>;
  if (status.running === false) return true;
  return (
    status.running === true &&
    (status.origin === "manual" || status.origin === "escalation") &&
    (status.phase === "preparing" ||
      status.phase === "researching" ||
      status.phase === "writing" ||
      status.phase === "finalizing") &&
    typeof status.activity === "string" &&
    typeof status.startedAt === "string" &&
    typeof status.updatedAt === "string"
  );
}

function recordEvent(symbol: string, running: boolean): void {
  latestEvents.set(symbol, { revision: ++nextEventRevision, running });
}

function markUnseenIfInactive(symbol: string): void {
  if (activeSymbol !== undefined && activeSymbol !== symbol) {
    unseen = new Set(unseen);
    unseen.add(symbol);
  }
}

function handleInit(payload: { runs?: unknown }): void {
  if (!Array.isArray(payload.runs)) return;
  const next = new Map<string, RunningReassessStatus>();
  const eventStates = new Map<string, boolean>();
  for (const entry of payload.runs) {
    if (!entry || typeof entry !== "object") continue;
    const { symbol, status } = entry as { symbol?: unknown; status?: unknown };
    if (typeof symbol !== "string" || !isReassessStatus(status)) continue;
    eventStates.set(symbol, status.running);
    if (status.running) next.set(symbol, status);
    else next.delete(symbol);
  }

  const staleCandidates = new Set(runs.keys());
  for (const symbol of pendingSinceDisconnect) staleCandidates.add(symbol);
  for (const symbol of staleCandidates) {
    if (next.has(symbol)) continue;
    eventStates.set(symbol, false);
    markUnseenIfInactive(symbol);
  }
  pendingSinceDisconnect = new Set();

  for (const [symbol, running] of eventStates) recordEvent(symbol, running);
  runs = next;
  emit();
}

function handleUpdate(payload: { symbol?: unknown; status?: unknown }): void {
  const { symbol, status } = payload;
  if (typeof symbol !== "string" || !isReassessStatus(status)) return;
  recordEvent(symbol, status.running);

  if (status.running) {
    runs = new Map(runs);
    runs.set(symbol, status);
    emit();
    return;
  }

  runs = new Map(runs);
  runs.delete(symbol);
  markUnseenIfInactive(symbol);
  emit();
}

function handleConnected(connected: boolean): void {
  if (connected) return;
  for (const symbol of runs.keys()) pendingSinceDisconnect.add(symbol);
  runs = new Map();
  emit();
}

function onPayload(payload: unknown): void {
  if (!payload || typeof payload !== "object") return;
  const envelope = payload as { type?: unknown };
  if (envelope.type === "init") handleInit(payload as { runs?: unknown });
  else if (envelope.type === "update") handleUpdate(payload as { symbol?: unknown; status?: unknown });
}

export function subscribeAnalystRuns(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    unsubscribeChannel = subscribeChannel({ kind: "analyst-runs" }, onPayload, handleConnected);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      unsubscribeChannel?.();
      unsubscribeChannel = null;
      runs = new Map();
      emit();
    }
  };
}

export function getAnalystRunsSnapshot(): AnalystRunsSnapshot {
  return snapshot;
}

export function getAnalystRunStatus(symbol: string): RunningReassessStatus | null {
  return runs.get(symbol) ?? null;
}

export function getLatestAnalystRunEvent(symbol: string): AnalystRunEventState | null {
  return latestEvents.get(symbol) ?? null;
}

export function setActiveSymbol(symbol: string | null): void {
  activeSymbol = symbol;
  if (symbol === null || !unseen.has(symbol)) return;
  unseen = new Set(unseen);
  unseen.delete(symbol);
  emit();
}

export function clearActiveSymbol(): void {
  activeSymbol = undefined;
}

export function useAnalystRunStatus(symbol: string, enabled = true): RunningReassessStatus | null {
  return useSyncExternalStore(
    enabled ? subscribeAnalystRuns : NOOP_SUBSCRIBE,
    enabled ? () => getAnalystRunStatus(symbol) : () => NULL_STATUS,
  );
}

export function useAnalystRunIndicator(symbol: string): AnalystRunIndicator {
  return useSyncExternalStore(subscribeAnalystRuns, () => {
    const index = (runs.has(symbol) ? 2 : 0) + (unseen.has(symbol) ? 1 : 0);
    return INDICATORS[index];
  });
}

export function resetAnalystRunsStoreForTests(): void {
  runs = new Map();
  unseen = new Set();
  pendingSinceDisconnect = new Set();
  latestEvents = new Map();
  nextEventRevision = 0;
  snapshot = { runs, unseen };
  listeners.clear();
  activeSymbol = undefined;
  unsubscribeChannel?.();
  unsubscribeChannel = null;
}
