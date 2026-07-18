import type { ReactNode } from 'react';
import {
  formatClockInZone,
  formatDateTimeInZone,
  formatMarketClock,
  formatMarketDateTime,
  formatMarketMonthDayTime,
  formatMonthDayTimeInZone,
  localTimeZone,
  marketTimeZone,
  shouldShowLocalTime,
  type Market,
  type TimeInput,
} from '@kansoku/shared/time';
import { type TimeDisplayPreference, useTimeDisplayPreference } from '../timeDisplayPreference';
import { Tooltip } from './Tooltip';

type MarketTimeFormat = 'clock' | 'date-time' | 'month-day-time';

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
  market?: Market;
  value: TimeInput;
}

const MARKET_TOOLTIP_LABEL: Record<Market, string> = {
  US: '美东时间',
  HK: '港股（香港时间）',
  CN: '北京时间',
};

function formatTime(
  value: TimeInput,
  format: MarketTimeFormat,
  includeZone: boolean | undefined,
  market: Market,
): string {
  if (format === 'clock') return formatMarketClock(value, includeZone ?? false, market);
  if (format === 'month-day-time')
    return formatMarketMonthDayTime(value, includeZone ?? false, market);
  return formatMarketDateTime(value, includeZone ?? true, market);
}

function formatLocalTime(
  value: TimeInput,
  timeZone: string,
  format: MarketTimeFormat,
  includeZone?: boolean,
): string {
  if (format === 'clock') return formatClockInZone(value, timeZone, includeZone ?? false);
  if (format === 'month-day-time')
    return formatMonthDayTimeInZone(value, timeZone, includeZone ?? false);
  return formatDateTimeInZone(value, timeZone, includeZone ?? true);
}

export function resolveMarketTimePresentation({
  value,
  preference,
  timeZone,
  format = 'date-time',
  includeZone,
  market = 'US',
}: {
  value: TimeInput;
  preference: TimeDisplayPreference;
  timeZone: string;
  format?: MarketTimeFormat;
  includeZone?: boolean;
  market?: Market;
}): MarketTimePresentation {
  const marketLabel = formatTime(value, format, includeZone, market);
  if (!shouldShowLocalTime(value, timeZone, marketTimeZone(market)))
    return { label: marketLabel, tooltip: null };

  if (preference === 'local') {
    return {
      label: formatLocalTime(value, timeZone, format, includeZone),
      tooltip: `${MARKET_TOOLTIP_LABEL[market]} ${formatMarketDateTime(value, true, market)}`,
    };
  }

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
  market = 'US',
  value,
}: MarketTimeProps) {
  const preference = useTimeDisplayPreference();
  const presentation = resolveMarketTimePresentation({
    value,
    preference,
    timeZone: localTimeZone(),
    format,
    includeZone,
    market,
  });
  const label = preference === 'local' ? presentation.label : (children ?? presentation.label);

  if (!presentation.tooltip) return <span className={className}>{label}</span>;

  return (
    <Tooltip className={className} content={presentation.tooltip} focusable={focusable}>
      <span>{label}</span>
    </Tooltip>
  );
}
