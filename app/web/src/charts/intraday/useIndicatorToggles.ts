import { useEffect, useState } from "react";

export type IndicatorToggleKey =
  | "crosses"
  | "divergence"
  | "beichi"
  | "pattern123"
  | "candle"
  | "ai"
  | "levels"
  | "ema";

export const INDICATOR_TOGGLE_LABELS: Record<IndicatorToggleKey, string> = {
  crosses: "金叉死叉",
  divergence: "自动背离",
  beichi: "自动背驰",
  pattern123: "123 结构",
  candle: "K线形态",
  ai: "AI 标注",
  levels: "价位线",
  ema: "EMA 均线",
};

export const INDICATOR_TOGGLE_KEYS = Object.keys(INDICATOR_TOGGLE_LABELS) as IndicatorToggleKey[];

const STORAGE_KEY = "intraday-indicators";

function defaultToggles(): Record<IndicatorToggleKey, boolean> {
  return Object.fromEntries(INDICATOR_TOGGLE_KEYS.map((k) => [k, true])) as Record<IndicatorToggleKey, boolean>;
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

  const toggle = (key: IndicatorToggleKey) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return { toggles, toggle };
}
