import type { ChannelSpec } from "./wsHub";

const PREFIX = "ws-snapshot:";
const THROTTLE_MS = 5_000;

export interface WsSnapshot {
  at: number;
  data: unknown;
}

const lastWriteAt = new Map<string, number>();

function isWhitelisted(spec: ChannelSpec): boolean {
  if (spec.kind === "board") return true;
  if (spec.kind === "quotes" && !spec.extra) return true;
  return false;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function keyFor(spec: ChannelSpec): string {
  return PREFIX + stableStringify(spec);
}

export function saveSnapshot(spec: ChannelSpec, data: unknown): void {
  if (!isWhitelisted(spec)) return;
  const key = keyFor(spec);
  const now = Date.now();
  const last = lastWriteAt.get(key);
  if (last !== undefined && now - last < THROTTLE_MS) return;
  try {
    localStorage.setItem(key, JSON.stringify({ at: now, data } satisfies WsSnapshot));
    lastWriteAt.set(key, now);
  } catch {
    return;
  }
}

export function loadSnapshot(spec: ChannelSpec): WsSnapshot | null {
  if (!isWhitelisted(spec)) return null;
  try {
    const raw = localStorage.getItem(keyFor(spec));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.at !== "number" || !("data" in parsed)) return null;
    return parsed as WsSnapshot;
  } catch {
    return null;
  }
}
