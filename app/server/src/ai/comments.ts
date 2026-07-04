import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { CockpitComment } from "../../../shared/types.js";
import { CHART_DATA_DIR } from "../env.js";
import { easternDate } from "../services/session.js";

const COMMENTS_DIR = join(CHART_DATA_DIR, "comments");

type Listener = (comment: CockpitComment) => void;

const listeners = new Map<string, Set<Listener>>();

export function onComment(symbol: string, listener: Listener): () => void {
  let set = listeners.get(symbol);
  if (!set) {
    set = new Set();
    listeners.set(symbol, set);
  }
  set.add(listener);
  return () => {
    const current = listeners.get(symbol);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(symbol);
  };
}

function broadcast(comment: CockpitComment): void {
  const set = listeners.get(comment.symbol);
  if (!set) return;
  for (const listener of [...set]) listener(comment);
}

function fileName(symbol: string, date: string): string {
  return `${symbol.replace(/[/\\]/g, "_")}-${date}.json`;
}

function filePath(symbol: string, date: string): string {
  return join(COMMENTS_DIR, fileName(symbol, date));
}

export async function listComments(symbol: string, date: string): Promise<CockpitComment[]> {
  try {
    return JSON.parse(await fs.readFile(filePath(symbol, date), "utf-8")) as CockpitComment[];
  } catch {
    return [];
  }
}

export async function appendComment(comment: CockpitComment): Promise<void> {
  const date = easternDate(new Date(comment.ts));
  await fs.mkdir(COMMENTS_DIR, { recursive: true });
  const existing = await listComments(comment.symbol, date);
  existing.push(comment);
  await fs.writeFile(filePath(comment.symbol, date), JSON.stringify(existing));
  broadcast(comment);
}
