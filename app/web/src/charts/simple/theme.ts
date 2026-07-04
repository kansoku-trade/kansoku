import type { CSSProperties } from "react";

export const UP_COLOR = "#22c55e";
export const DOWN_COLOR = "#ef4444";
export const AXIS_COLOR = "#8b949e";
export const AXIS_LINE_COLOR = "#666";
export const GRID_COLOR = "#1f242c";
export const ZERO_LINE_COLOR = "#888";

export const tooltipContentStyle: CSSProperties = {
  backgroundColor: "rgba(20,24,30,0.92)",
  border: "1px solid #333",
  borderRadius: 4,
  color: "#eee",
  fontSize: 12,
};

export const tooltipLabelStyle: CSSProperties = { color: "#8b949e", marginBottom: 4 };

export const tooltipItemStyle: CSSProperties = { color: "#eee" };

export function hhmm(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fullTime(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
