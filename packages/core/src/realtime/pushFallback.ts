import type { SessionKind } from "../../../shared/types.js";

export const REGULAR_POLL_MS = 15_000;
export const PRE_POST_POLL_MS = 30_000;
export const OVERNIGHT_POLL_MS = 300_000;

export function baseIntervalMs(session: SessionKind): number {
  if (session === "regular") return REGULAR_POLL_MS;
  if (session === "pre" || session === "post") return PRE_POST_POLL_MS;
  return OVERNIGHT_POLL_MS;
}

export function isPushFresh(lastPushAt: number | null, now: number, freshWindowMs: number): boolean {
  return lastPushAt !== null && now - lastPushAt <= freshWindowMs;
}

export function pollIntervalMs(
  lastPushAt: number | null,
  now: number,
  session: SessionKind,
  freshWindowMs: number,
): number {
  return isPushFresh(lastPushAt, now, freshWindowMs) ? OVERNIGHT_POLL_MS : baseIntervalMs(session);
}
