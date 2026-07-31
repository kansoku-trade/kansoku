import { etMoment, marketSession } from './session';
import type { MarketSession } from './session';
import { formatTapeChange, formatTapeLast, parseTapeQuotes, tapeDirection } from './tape';

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

const TAPE_REFRESH_MS = 60_000;

const initTape = (): void => {
  const tape = document.querySelector<HTMLElement>('[data-chrome-tape]');
  if (!tape) return;

  const refresh = async () => {
    if (document.hidden) return;
    try {
      const res = await fetch('/api/tape');
      if (!res.ok) return;
      const quotes = parseTapeQuotes(await res.json());
      let rendered = false;

      for (const quote of quotes) {
        const item = tape.querySelector<HTMLElement>(`[data-tape-symbol="${quote.symbol}"]`);
        if (!item) continue;
        const last = item.querySelector<HTMLElement>('[data-tape-last]');
        const chg = item.querySelector<HTMLElement>('[data-tape-chg]');
        if (!last || !chg) continue;

        last.textContent = formatTapeLast(quote.last);
        chg.textContent = formatTapeChange(quote.changePercent);
        chg.className = `chrome-tape-chg is-${tapeDirection(quote.changePercent)}`;
        rendered = true;
      }

      if (rendered) tape.classList.add('is-live');
    } catch {
      /* no data, tape stays hidden */
    }
  };

  void refresh();
  setInterval(() => void refresh(), TAPE_REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh();
  });
};

export const initTerminalChrome = (): void => {
  initTape();
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
