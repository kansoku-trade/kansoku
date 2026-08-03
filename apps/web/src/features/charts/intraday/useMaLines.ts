import { useCallback, useEffect, useMemo, useState } from 'react';
import { ema, lineData } from '@kansoku/core/analysis/indicators';
import type { LinePoint } from '@kansoku/shared/types';
import { theme } from '@web/lib/theme';

export interface MaLine {
  id: string;
  period: number;
  color: string;
  visible: boolean;
}

export interface MaSeries {
  line: MaLine;
  data: LinePoint[];
  last: number | null;
}

export const MAX_MA_LINES = 5;
export const MIN_MA_PERIOD = 2;
export const MAX_MA_PERIOD = 500;

export const MA_LINES_STORAGE_KEY = 'intraday-ma-lines';

const MA_PALETTE = [
  theme.accent,
  theme.textPrimary,
  theme.textSecondary,
  theme.up,
  theme.down,
] as const;

const DEFAULT_PERIODS = [9, 21, 55];

export function defaultMaLines(): MaLine[] {
  return DEFAULT_PERIODS.map((period, i) => ({
    id: `ma-${period}`,
    period,
    color: MA_PALETTE[i],
    visible: true,
  }));
}

export function sanitizeMaLines(raw: unknown): MaLine[] {
  if (!Array.isArray(raw)) return defaultMaLines();
  const seen = new Set<number>();
  const lines: MaLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Partial<MaLine>;
    const period = Math.trunc(Number(entry.period));
    if (!Number.isFinite(period) || period < MIN_MA_PERIOD || period > MAX_MA_PERIOD) continue;
    if (seen.has(period)) continue;
    seen.add(period);
    lines.push({
      id: typeof entry.id === 'string' && entry.id ? entry.id : `ma-${period}`,
      period,
      color:
        typeof entry.color === 'string' && entry.color
          ? entry.color
          : MA_PALETTE[lines.length % MA_PALETTE.length],
      visible: entry.visible !== false,
    });
    if (lines.length >= MAX_MA_LINES) break;
  }
  return lines.length ? lines : defaultMaLines();
}

function loadStored(storageKey: string): MaLine[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultMaLines();
    return sanitizeMaLines(JSON.parse(raw));
  } catch {
    return defaultMaLines();
  }
}

function nextPeriod(lines: MaLine[]): number {
  const longest = lines.reduce((max, l) => Math.max(max, l.period), 0);
  return Math.min(MAX_MA_PERIOD, longest ? longest * 2 : DEFAULT_PERIODS[0]);
}

export interface MaLinesApi {
  maLines: MaLine[];
  addMaLine: () => void;
  removeMaLine: (id: string) => void;
  updateMaLine: (id: string, patch: Partial<Omit<MaLine, 'id'>>) => void;
}

export function useMaLines(storageKey: string = MA_LINES_STORAGE_KEY): MaLinesApi {
  const [maLines, setMaLines] = useState(() => loadStored(storageKey));

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(maLines));
  }, [storageKey, maLines]);

  const addMaLine = useCallback(() => {
    setMaLines((prev) => {
      if (prev.length >= MAX_MA_LINES) return prev;
      const period = nextPeriod(prev);
      if (prev.some((l) => l.period === period)) return prev;
      return [
        ...prev,
        {
          id: `ma-${period}-${prev.length}`,
          period,
          color: MA_PALETTE[prev.length % MA_PALETTE.length],
          visible: true,
        },
      ];
    });
  }, []);

  const removeMaLine = useCallback((id: string) => {
    setMaLines((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const updateMaLine = useCallback((id: string, patch: Partial<Omit<MaLine, 'id'>>) => {
    setMaLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  return { maLines, addMaLine, removeMaLine, updateMaLine };
}

export function computeMaSeries(
  candles: { time: number; close: number }[],
  lines: MaLine[],
): MaSeries[] {
  const times = candles.map((c) => c.time);
  const closes = candles.map((c) => c.close);
  return lines.map((line) => {
    const values = ema(closes, line.period);
    let last: number | null = null;
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i] !== null) {
        last = values[i];
        break;
      }
    }
    return { line, data: lineData(times, values), last };
  });
}

export function useMaSeries(
  candles: { time: number; close: number }[],
  lines: MaLine[],
): MaSeries[] {
  return useMemo(() => computeMaSeries(candles, lines), [candles, lines]);
}
