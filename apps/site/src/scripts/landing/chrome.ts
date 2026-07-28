import { etMoment, marketSession } from './session';
import type { MarketSession } from './session';

const SESSION_LABEL: Record<MarketSession, string> = {
  PRE: 'PRE-MARKET',
  OPEN: 'OPEN',
  POST: 'AFTER-HOURS',
  CLOSED: 'CLOSED',
};

const SESSION_CLASS: Record<MarketSession, string> = {
  PRE: 'is-pre',
  OPEN: 'is-open',
  POST: 'is-post',
  CLOSED: 'is-closed',
};

const clockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const formatClock = (now: Date): string => {
  const parts = clockFormatter.formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00';

  return `${value('hour')}:${value('minute')}:${value('second')}`;
};

export const initTerminalChrome = (): void => {
  const clock = document.querySelector<HTMLElement>('[data-chrome-clock]');
  const dot = document.querySelector<HTMLElement>('[data-chrome-session-dot]');
  const label = document.querySelector<HTMLElement>('[data-chrome-session-text]');
  if (!clock || !dot || !label) return;

  const tick = () => {
    const now = new Date();
    clock.textContent = formatClock(now);
    const session = marketSession(etMoment(now));
    label.textContent = SESSION_LABEL[session];
    dot.className = `chrome-session-dot ${SESSION_CLASS[session]}`;
  };

  tick();
  setInterval(tick, 1000);
};
