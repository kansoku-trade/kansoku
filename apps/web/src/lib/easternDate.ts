const easternDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function easternDate(at: Date): string {
  return easternDateFormatter.format(at);
}

export function easternToday(now: Date = new Date()): string {
  return easternDate(now);
}

export function isCurrentSessionId(id: string, now: Date = new Date()): boolean {
  return id.slice(0, 10) === easternToday(now);
}
