import type { ReactNode } from "react";
import {
  formatClockInZone,
  formatDateTimeInZone,
  formatMarketClock,
  formatMarketDateTime,
  formatMarketMonthDayTime,
  formatMonthDayTimeInZone,
  localTimeZone,
  shouldShowLocalTime,
  type TimeInput,
} from "../../../shared/time";
import {
  type TimeDisplayPreference,
  useTimeDisplayPreference,
} from "../timeDisplayPreference";
import { Tooltip } from "./Tooltip";

type MarketTimeFormat = "clock" | "date-time" | "month-day-time";

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
  value: TimeInput;
}

function formatTime(value: TimeInput, format: MarketTimeFormat, includeZone?: boolean): string {
  if (format === "clock") return formatMarketClock(value, includeZone ?? false);
  if (format === "month-day-time") return formatMarketMonthDayTime(value, includeZone ?? false);
  return formatMarketDateTime(value, includeZone ?? true);
}

function formatLocalTime(
  value: TimeInput,
  timeZone: string,
  format: MarketTimeFormat,
  includeZone?: boolean,
): string {
  if (format === "clock") return formatClockInZone(value, timeZone, includeZone ?? false);
  if (format === "month-day-time") return formatMonthDayTimeInZone(value, timeZone, includeZone ?? false);
  return formatDateTimeInZone(value, timeZone, includeZone ?? true);
}

export function resolveMarketTimePresentation({
  value,
  preference,
  timeZone,
  format = "date-time",
  includeZone,
}: {
  value: TimeInput;
  preference: TimeDisplayPreference;
  timeZone: string;
  format?: MarketTimeFormat;
  includeZone?: boolean;
}): MarketTimePresentation {
  const marketLabel = formatTime(value, format, includeZone);
  if (!shouldShowLocalTime(value, timeZone)) return { label: marketLabel, tooltip: null };

  if (preference === "local") {
    return {
      label: formatLocalTime(value, timeZone, format, includeZone),
      tooltip: `美东时间 ${formatMarketDateTime(value, true)}`,
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
  format = "date-time",
  includeZone,
  value,
}: MarketTimeProps) {
  const preference = useTimeDisplayPreference();
  const presentation = resolveMarketTimePresentation({
    value,
    preference,
    timeZone: localTimeZone(),
    format,
    includeZone,
  });
  const label = preference === "local" ? presentation.label : (children ?? presentation.label);

  if (!presentation.tooltip) return <span className={className}>{label}</span>;

  return (
    <Tooltip className={className} content={presentation.tooltip} focusable={focusable}>
      <span>{label}</span>
    </Tooltip>
  );
}
