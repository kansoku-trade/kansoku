export const MARKET_TIME_ZONE = "America/New_York";

export type TimeInput = Date | number | string;

interface FormatParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  timeZoneName?: string;
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: MARKET_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: MARKET_TIME_ZONE,
  month: "short",
});

const zonedFormatterCache = new Map<string, Intl.DateTimeFormat>();

function toDate(input: TimeInput): Date {
  if (input instanceof Date) return input;
  if (typeof input === "number") return new Date(input * 1000);
  return new Date(input);
}

function formatterFor(timeZone: string, includeZoneName: boolean): Intl.DateTimeFormat {
  if (timeZone === MARKET_TIME_ZONE && !includeZoneName) return dateTimeFormatter;

  const key = `${timeZone}:${includeZoneName ? "zone" : "plain"}`;
  const cached = zonedFormatterCache.get(key);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(includeZoneName ? { timeZoneName: "short" } : {}),
  });
  zonedFormatterCache.set(key, formatter);
  return formatter;
}

function parts(input: TimeInput, timeZone = MARKET_TIME_ZONE, includeZoneName = false): FormatParts {
  const p = Object.fromEntries(formatterFor(timeZone, includeZoneName).formatToParts(toDate(input)).map((part) => [part.type, part.value]));
  return {
    year: String(p.year ?? ""),
    month: String(p.month ?? ""),
    day: String(p.day ?? ""),
    hour: String(p.hour ?? ""),
    minute: String(p.minute ?? ""),
    timeZoneName: typeof p.timeZoneName === "string" ? p.timeZoneName : undefined,
  };
}

function sameWallClock(input: TimeInput, a: string, b: string): boolean {
  const left = parts(input, a);
  const right = parts(input, b);
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || MARKET_TIME_ZONE;
}

export function formatDateTimeInZone(input: TimeInput, timeZone: string, includeZone = true): string {
  const p = parts(input, timeZone, includeZone);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}${includeZone && p.timeZoneName ? ` ${p.timeZoneName}` : ""}`;
}

export function formatMonthDayTimeInZone(input: TimeInput, timeZone: string, includeZone = false): string {
  const p = parts(input, timeZone, includeZone);
  return `${p.month}-${p.day} ${p.hour}:${p.minute}${includeZone && p.timeZoneName ? ` ${p.timeZoneName}` : ""}`;
}

export function formatClockInZone(input: TimeInput, timeZone: string, includeZone = false): string {
  const p = parts(input, timeZone, includeZone);
  return `${p.hour}:${p.minute}${includeZone && p.timeZoneName ? ` ${p.timeZoneName}` : ""}`;
}

export function shouldShowLocalTime(input: TimeInput, currentTimeZone = localTimeZone()): boolean {
  if (!currentTimeZone || currentTimeZone === MARKET_TIME_ZONE) return false;
  try {
    return !sameWallClock(input, MARKET_TIME_ZONE, currentTimeZone);
  } catch {
    return false;
  }
}

export function localMarketTimeLabel(input: TimeInput, currentTimeZone = localTimeZone()): string | null {
  return shouldShowLocalTime(input, currentTimeZone) ? formatDateTimeInZone(input, currentTimeZone, true) : null;
}

export function formatMarketDateTime(input: TimeInput, includeZone = true): string {
  const p = parts(input);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}${includeZone ? " ET" : ""}`;
}

export function formatMarketMonthDayTime(input: TimeInput, includeZone = false): string {
  const p = parts(input);
  return `${p.month}-${p.day} ${p.hour}:${p.minute}${includeZone ? " ET" : ""}`;
}

export function marketDate(input: TimeInput = new Date()): string {
  const p = parts(input);
  return `${p.year}-${p.month}-${p.day}`;
}

export function formatMarketClock(input: TimeInput, includeZone = false): string {
  const p = parts(input);
  return `${p.hour}:${p.minute}${includeZone ? " ET" : ""}`;
}

export function formatMarketTick(input: TimeInput, tickMarkType: number): string {
  if (tickMarkType === 0) return parts(input).year;
  if (tickMarkType === 1) return monthFormatter.format(toDate(input));
  if (tickMarkType === 2) {
    const p = parts(input);
    return `${p.month}-${p.day}`;
  }
  return formatMarketClock(input);
}
