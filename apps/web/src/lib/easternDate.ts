const easternDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function easternToday(now: Date = new Date()): string {
  return easternDateFormatter.format(now);
}

export function isCurrentSessionId(id: string, now: Date = new Date()): boolean {
  return id.slice(0, 10) === easternToday(now);
}
