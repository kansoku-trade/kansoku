const GDELT_WINDOW_MS = 48 * 60 * 60 * 1000;
const EDGAR_WINDOW_DAYS = 14;

export interface GdeltWindow {
  startIso: string;
  endIso: string;
}

export function gdeltWindow(cutoffIso: string): GdeltWindow {
  const cutoffMs = Date.parse(cutoffIso);
  return {
    startIso: new Date(cutoffMs - GDELT_WINDOW_MS).toISOString(),
    endIso: new Date(cutoffMs).toISOString(),
  };
}

export function toGdeltStamp(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").replace("Z", "");
}

export interface EdgarWindow {
  startDate: string;
  endDate: string;
}

function addUtcDays(dateStr: string, days: number): string {
  const date = new Date(Date.parse(`${dateStr}T00:00:00Z`));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function edgarWindow(cutoffIso: string): EdgarWindow {
  const cutoffDate = cutoffIso.slice(0, 10);
  return {
    startDate: addUtcDays(cutoffDate, -EDGAR_WINDOW_DAYS),
    endDate: cutoffDate,
  };
}
