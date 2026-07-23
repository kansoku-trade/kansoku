import { useEffect, useState, type ReactNode } from 'react';
import {
  formatDateTimeInZone,
  formatMarketClock,
  formatMarketDateTime,
  formatMarketMonthDayTime,
  localTimeZone,
  marketTimeZone,
  shouldShowLocalTime,
  type Market,
  type TimeInput,
} from '@kansoku/shared/time';
import { Tooltip } from './Tooltip';

type MarketTimeFormat = 'clock' | 'clock-seconds' | 'date-time' | 'month-day-time';

interface MarketTimePresentation {
  label: string;
  tooltip: string | null;
}

interface MarketTimeProps {
  children?: ReactNode;
  className?: string;
  focusable?: boolean;
  format?: MarketTimeFormat;
  includeZone?: boolean;
  live?: boolean;
  market?: Market;
  value: TimeInput;
}

function formatTime(
  value: TimeInput,
  format: MarketTimeFormat,
  includeZone: boolean | undefined,
  market: Market,
): string {
  if (format === 'clock') return formatMarketClock(value, includeZone ?? false, market);
  if (format === 'clock-seconds')
    return formatMarketClock(value, includeZone ?? false, market, true);
  if (format === 'month-day-time')
    return formatMarketMonthDayTime(value, includeZone ?? false, market);
  return formatMarketDateTime(value, includeZone ?? true, market);
}

export function resolveMarketTimePresentation({
  value,
  timeZone,
  format = 'date-time',
  includeZone,
  market = 'US',
}: {
  value: TimeInput;
  timeZone: string;
  format?: MarketTimeFormat;
  includeZone?: boolean;
  market?: Market;
  preference?: 'market' | 'local';
}): MarketTimePresentation {
  const marketLabel = formatTime(value, format, includeZone, market);
  if (!shouldShowLocalTime(value, timeZone, marketTimeZone(market)))
    return { label: marketLabel, tooltip: null };

  return {
    label: marketLabel,
    tooltip: `本地时间 ${formatDateTimeInZone(value, timeZone, true)}`,
  };
}

export function MarketTime({
  children,
  className,
  focusable,
  format = 'date-time',
  includeZone,
  live = false,
  market = 'US',
  value,
}: MarketTimeProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [live]);

  const effectiveValue: TimeInput = live ? nowMs / 1000 : value;
  const presentation = resolveMarketTimePresentation({
    value: effectiveValue,
    timeZone: localTimeZone(),
    format,
    includeZone,
    market,
  });
  const label = children ?? presentation.label;

  if (!presentation.tooltip) return <span className={className}>{label}</span>;

  return (
    <Tooltip className={className} content={presentation.tooltip} focusable={focusable}>
      <span>{label}</span>
    </Tooltip>
  );
}
