import type { OffSessionBar, SessionKind } from "../../../shared/types.js";

const etFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour12: false,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function easternDate(date: Date = new Date()): string {
  return dateFormatter.format(date);
}

const REGULAR_START = 9 * 60 + 30;
const REGULAR_END = 16 * 60;
const PRE_START = 4 * 60;
const POST_END = 20 * 60;

export function classifySession(ts: number): SessionKind {
  const parts = etFormatter.formatToParts(new Date(ts * 1000));
  let weekday = "";
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === "weekday") weekday = p.value;
    else if (p.type === "hour") hour = Number(p.value);
    else if (p.type === "minute") minute = Number(p.value);
  }
  if (weekday === "Sat" || weekday === "Sun") return "overnight";
  const min = (hour % 24) * 60 + minute;
  if (min >= REGULAR_START && min < REGULAR_END) return "regular";
  if (min >= PRE_START && min < REGULAR_START) return "pre";
  if (min >= REGULAR_END && min < POST_END) return "post";
  return "overnight";
}

export function offSessionBars(timesTs: number[]): OffSessionBar[] {
  const out: OffSessionBar[] = [];
  for (const t of timesTs) {
    const kind = classifySession(t);
    if (kind !== "regular") out.push({ time: t, kind });
  }
  return out;
}
