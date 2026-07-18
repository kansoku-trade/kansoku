import { useCallback, useEffect, useState } from "react";
import { theme } from "@web/theme";

export type IndicatorToggleKey =
  | "crosses"
  | "divergence"
  | "beichi"
  | "pattern123"
  | "candle"
  | "ai"
  | "levels"
  | "fvg"
  | "ema"
  | "vwap"
  | "daylevel"
  | "optwall";

export const INDICATOR_TOGGLE_ORDER: IndicatorToggleKey[] = [
  "ema",
  "vwap",
  "levels",
  "daylevel",
  "fvg",
  "pattern123",
  "optwall",
  "crosses",
  "divergence",
  "beichi",
  "candle",
  "ai",
];

export const INDICATOR_TOGGLE_LABELS: Record<IndicatorToggleKey, string> = {
  crosses: "金叉死叉",
  divergence: "自动背离",
  beichi: "自动背驰",
  pattern123: "123 结构",
  candle: "K线形态",
  ai: "AI 标注",
  levels: "价位线",
  fvg: "FVG 缺口",
  ema: "EMA 均线",
  vwap: "VWAP",
  daylevel: "日内参照位",
  optwall: "期权墙",
};

export const INDICATOR_TOGGLE_COLORS: Record<IndicatorToggleKey, string> = {
  ema: theme.accent,
  vwap: theme.up,
  levels: theme.textSecondary,
  daylevel: theme.textPrimary,
  fvg: theme.up,
  pattern123: theme.accent,
  optwall: theme.down,
  crosses: theme.up,
  divergence: theme.down,
  beichi: theme.textSecondary,
  candle: theme.accent,
  ai: theme.accent,
};

export const INDICATOR_TOGGLE_KEYS = INDICATOR_TOGGLE_ORDER;

const STORAGE_KEY = "intraday-indicators";

const DEFAULT_ON = new Set<IndicatorToggleKey>(["ema", "vwap", "levels", "daylevel"]);

function defaultToggles(): Record<IndicatorToggleKey, boolean> {
  return Object.fromEntries(
    INDICATOR_TOGGLE_KEYS.map((k) => [k, DEFAULT_ON.has(k)]),
  ) as Record<IndicatorToggleKey, boolean>;
}

function loadToggles(): Record<IndicatorToggleKey, boolean> {
  const merged = defaultToggles();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return merged;
    const stored = JSON.parse(raw) as Partial<Record<string, unknown>>;
    for (const key of INDICATOR_TOGGLE_KEYS) {
      if (typeof stored[key] === "boolean") merged[key] = stored[key] as boolean;
    }
  } catch {
    return merged;
  }
  return merged;
}

export function useIndicatorToggles() {
  const [toggles, setToggles] = useState<Record<IndicatorToggleKey, boolean>>(loadToggles);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toggles));
  }, [toggles]);

  const set = useCallback((key: IndicatorToggleKey, value: boolean) => {
    setToggles((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);

  return { toggles, set };
}
