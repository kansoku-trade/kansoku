export type MarketSession = 'PRE' | 'OPEN' | 'POST' | 'CLOSED';

export interface EtMoment {
  weekday: number;
  minutes: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const etFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export const etMoment = (now: Date): EtMoment => {
  const parts = etFormatter.formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  const weekday = WEEKDAY_INDEX[value('weekday')] ?? 0;
  const hour = Number(value('hour')) % 24;
  const minute = Number(value('minute'));

  return { weekday, minutes: hour * 60 + minute };
};

export const marketSession = (moment: EtMoment): MarketSession => {
  if (moment.weekday === 0 || moment.weekday === 6) return 'CLOSED';

  const { minutes } = moment;
  if (minutes >= 240 && minutes < 570) return 'PRE';
  if (minutes >= 570 && minutes < 960) return 'OPEN';
  if (minutes >= 960 && minutes < 1200) return 'POST';
  return 'CLOSED';
};
