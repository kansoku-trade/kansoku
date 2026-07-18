const DASH = "—";

export function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

export function fmtScore(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH;
  return value.toFixed(3);
}

export function fmtRate(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH;
  return `${(value * 100).toFixed(1)}%`;
}

export function fmtCostUsd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH;
  return `$${value.toFixed(4)}`;
}

export function fmtDurationMs(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH;
  return `${(value / 1000).toFixed(1)}s`;
}

export function fmtCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return DASH;
  return value.toFixed(1);
}

export { DASH };
