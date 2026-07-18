import type { CSSProperties } from "react";
import { formatMarketClock, formatMarketDateTime, localMarketTimeLabel } from "@kansoku/shared/time";
import { theme } from "@web/theme";

export const UP_COLOR = theme.up;
export const DOWN_COLOR = theme.down;
export const AXIS_COLOR = theme.textSecondary;
export const AXIS_LINE_COLOR = theme.borderStrong;
export const GRID_COLOR = theme.border;
export const ZERO_LINE_COLOR = theme.textMuted;

export const tooltipContentStyle: CSSProperties = {
  backgroundColor: theme.bgSurface,
  border: `1px solid ${theme.border}`,
  borderRadius: 4,
  color: theme.textPrimary,
  fontSize: 12,
};

export const tooltipLabelStyle: CSSProperties = { color: theme.textSecondary, marginBottom: 4, whiteSpace: "pre-line" };

export const tooltipItemStyle: CSSProperties = { color: theme.textPrimary };

export function hhmm(t: number): string {
  return formatMarketClock(new Date(t));
}

export function fullTime(t: number): string {
  return formatMarketDateTime(new Date(t));
}

export function tooltipTime(t: number): string {
  const date = new Date(t);
  const local = localMarketTimeLabel(date);
  return local ? `${formatMarketDateTime(date)}\n本地时间 ${local}` : formatMarketDateTime(date);
}
