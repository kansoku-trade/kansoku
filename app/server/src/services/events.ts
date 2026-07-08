import { execFile } from "node:child_process";
import type { IntradayEventRisk, MacroEventItem } from "../../../shared/types.js";
import { filterMacroForSymbol } from "../ai/eventFilter.js";
import { easternDate } from "./session.js";

const CLI_TIMEOUT_MS = 20_000;
const EARNINGS_TTL_MS = 6 * 60 * 60_000;
const MACRO_TTL_MS = 60 * 60_000;
const MACRO_WINDOW_DAYS = 3;
const MAX_MACRO_ITEMS = 8;

const earningsCache = new Map<string, { at: number; val: IntradayEventRisk["next_earnings"] }>();
let macroCache: { at: number; val: MacroEventItem[] } | null = null;
const relevanceCache = new Map<string, { at: number; fingerprint: string; val: MacroEventItem[] }>();

interface CalendarInfo {
  content?: string;
  datetime?: string;
  data_kv?: { type?: string; value?: string }[];
}

interface CalendarPayload {
  list?: { date?: string; infos?: CalendarInfo[] }[];
}

function execCalendar(args: string[]): Promise<CalendarPayload> {
  return new Promise((resolve, reject) => {
    execFile(
      "longbridge",
      ["finance-calendar", ...args, "--format", "json"],
      { maxBuffer: 32 * 1024 * 1024, timeout: CLI_TIMEOUT_MS },
      (err, stdout) => {
        if (err) reject(err);
        else {
          try {
            resolve(JSON.parse(stdout) as CalendarPayload);
          } catch (e) {
            reject(e);
          }
        }
      },
    );
  });
}

function kv(info: CalendarInfo, type: string): string | null {
  const v = info.data_kv?.find((d) => d.type === type)?.value;
  return v && v !== "--" ? v : null;
}

async function nextEarnings(symbol: string, now: Date): Promise<IntradayEventRisk["next_earnings"]> {
  const hit = earningsCache.get(symbol);
  if (hit && Date.now() - hit.at < EARNINGS_TTL_MS) return hit.val;
  let val: IntradayEventRisk["next_earnings"] = null;
  try {
    const payload = await execCalendar(["report", "--symbol", symbol]);
    const today = easternDate(now);
    for (const day of payload.list ?? []) {
      if (!day.date || day.date < today) continue;
      const info = day.infos?.[0];
      if (info?.content) {
        val = { date: day.date, title: info.content };
        break;
      }
    }
  } catch {
    val = null;
  }
  earningsCache.set(symbol, { at: Date.now(), val });
  return val;
}

async function macroReleases(now: Date): Promise<MacroEventItem[]> {
  if (macroCache && Date.now() - macroCache.at < MACRO_TTL_MS) return macroCache.val;
  let val: MacroEventItem[] = [];
  try {
    const start = easternDate(now);
    const end = easternDate(new Date(now.getTime() + MACRO_WINDOW_DAYS * 86_400_000));
    const payload = await execCalendar(["macrodata", "--market", "US", "--star", "3", "--start", start, "--end", end]);
    for (const day of payload.list ?? []) {
      for (const info of day.infos ?? []) {
        const epoch = Number(info.datetime);
        if (!info.content || !Number.isFinite(epoch)) continue;
        val.push({
          ts: new Date(epoch * 1000).toISOString(),
          title: info.content,
          estimate: kv(info, "estimate"),
          previous: kv(info, "previous"),
        });
      }
    }
    val.sort((a, b) => (a.ts < b.ts ? -1 : 1));
    val = val.slice(0, MAX_MACRO_ITEMS);
  } catch {
    val = [];
  }
  macroCache = { at: Date.now(), val };
  return val;
}

async function relevantMacro(symbol: string, macro: MacroEventItem[], now: Date): Promise<MacroEventItem[]> {
  const upcoming = macro.filter((m) => Date.parse(m.ts) > now.getTime());
  if (!upcoming.length) return upcoming;
  const fingerprint = upcoming.map((m) => `${m.ts}|${m.title}`).join("\n");
  const hit = relevanceCache.get(symbol);
  if (hit && hit.fingerprint === fingerprint && Date.now() - hit.at < MACRO_TTL_MS) return hit.val;
  const val = await filterMacroForSymbol(symbol, upcoming).catch(() => upcoming);
  relevanceCache.set(symbol, { at: Date.now(), fingerprint, val });
  return val;
}

export async function getEventRisk(symbol: string, now = new Date()): Promise<IntradayEventRisk | null> {
  if (!/\.US$/i.test(symbol)) return null;
  const [earnings, macro] = await Promise.all([nextEarnings(symbol, now), macroReleases(now)]);
  const relevant = await relevantMacro(symbol, macro, now);
  if (!earnings && !relevant.length) return null;
  return { next_earnings: earnings, macro: relevant, updated_at: now.toISOString() };
}
