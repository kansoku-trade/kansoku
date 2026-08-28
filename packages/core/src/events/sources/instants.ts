// Calendars hand out plain dates for anything not scheduled to the minute. Midnight
// UTC is the tempting reading and the wrong one: on 2026-08-27T00:00:00Z a New York
// user sees the evening of the 26th, so a report lands a day early on the timeline of
// the market it belongs to. Noon Eastern is the same calendar day in both EDT
// (UTC-4) and EST (UTC-5), and reads as the placeholder it is rather than as a
// precise time somebody measured.
export const DATE_ONLY_HOUR_UTC = 16;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dateOnlyInstant(date: string): string | null {
  const match = DATE_ONLY.exec(date.trim());
  if (!match) return null;
  const at = Date.parse(`${match[0]}T${String(DATE_ONLY_HOUR_UTC).padStart(2, '0')}:00:00.000Z`);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
}
