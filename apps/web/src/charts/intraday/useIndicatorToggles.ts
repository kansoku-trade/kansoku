import { useCallback, useEffect, useState } from 'react';
import type { FeatureKey } from '@kansoku/pro-api/features';
import { theme } from '@web/theme';

export type IndicatorToggleKey =
  | 'crosses'
  | 'divergence'
  | 'beichi'
  | 'pattern123'
  | 'sb'
  | 'candle'
  | 'ai'
  | 'levels'
  | 'fvg'
  | 'ema'
  | 'vwap'
  | 'daylevel'
  | 'optwall';

export const INDICATOR_TOGGLE_ORDER: IndicatorToggleKey[] = [
  'ema',
  'vwap',
  'levels',
  'daylevel',
  'fvg',
  'pattern123',
  'sb',
  'optwall',
  'crosses',
  'divergence',
  'beichi',
  'candle',
  'ai',
];

export const INDICATOR_TOGGLE_LABELS: Record<IndicatorToggleKey, string> = {
  crosses: '金叉死叉',
  divergence: '自动背离',
  beichi: '自动背驰',
  pattern123: '123 结构',
  sb: 'SB 结构',
  candle: 'K线形态',
  ai: 'AI 标注',
  levels: '价位线',
  fvg: 'FVG 缺口',
  ema: 'EMA 均线',
  vwap: 'VWAP',
  daylevel: '日内参照位',
  optwall: '期权墙',
};

export const INDICATOR_TOGGLE_COLORS: Record<IndicatorToggleKey, string> = {
  ema: theme.accent,
  vwap: theme.up,
  levels: theme.textSecondary,
  daylevel: theme.textPrimary,
  fvg: theme.up,
  pattern123: theme.accent,
  sb: theme.accent,
  optwall: theme.down,
  crosses: theme.up,
  divergence: theme.down,
  beichi: theme.textSecondary,
  candle: theme.accent,
  ai: theme.accent,
};

export const INDICATOR_TOGGLE_KEYS = INDICATOR_TOGGLE_ORDER;

export const INDICATOR_FEATURE_GATES: Partial<Record<IndicatorToggleKey, FeatureKey>> = {
  divergence: 'auto-patterns',
  beichi: 'auto-patterns',
  pattern123: 'auto-patterns',
  sb: 'auto-patterns',
  candle: 'auto-patterns',
  optwall: 'options-walls',
};

export type MarkerRange = 'recent' | 'all';

export interface IndicatorPreset {
  key: string;
  label: string;
  on: IndicatorToggleKey[];
}

export const INDICATOR_PRESETS: IndicatorPreset[] = [
  { key: 'lean', label: '精简', on: ['ema', 'vwap', 'levels', 'daylevel'] },
  { key: 'std', label: '标准', on: ['ema', 'vwap', 'levels', 'daylevel', 'sb'] },
  { key: 'all', label: '全部', on: [...INDICATOR_TOGGLE_ORDER] },
];

const STORAGE_KEY = 'intraday-indicators';

const DEFAULT_ON = new Set<IndicatorToggleKey>(['ema', 'vwap', 'levels', 'daylevel', 'sb']);

function defaultToggles(): Record<IndicatorToggleKey, boolean> {
  return Object.fromEntries(INDICATOR_TOGGLE_KEYS.map((k) => [k, DEFAULT_ON.has(k)])) as Record<
    IndicatorToggleKey,
    boolean
  >;
}

function loadStored(): { toggles: Record<IndicatorToggleKey, boolean>; markerRange: MarkerRange } {
  const toggles = defaultToggles();
  let markerRange: MarkerRange = 'recent';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { toggles, markerRange };
    const stored = JSON.parse(raw) as Partial<Record<string, unknown>>;
    for (const key of INDICATOR_TOGGLE_KEYS) {
      if (typeof stored[key] === 'boolean') toggles[key] = stored[key] as boolean;
    }
    if (stored.markerRange === 'all') markerRange = 'all';
  } catch {
    return { toggles, markerRange };
  }
  return { toggles, markerRange };
}

export function useIndicatorToggles() {
  const [{ toggles, markerRange }, setState] = useState(loadStored);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...toggles, markerRange }));
  }, [toggles, markerRange]);

  const set = useCallback((key: IndicatorToggleKey, value: boolean) => {
    setState((prev) =>
      prev.toggles[key] === value ? prev : { ...prev, toggles: { ...prev.toggles, [key]: value } },
    );
  }, []);

  const applyPreset = useCallback((on: IndicatorToggleKey[]) => {
    const wanted = new Set(on);
    setState((prev) => ({
      ...prev,
      toggles: Object.fromEntries(INDICATOR_TOGGLE_KEYS.map((k) => [k, wanted.has(k)])) as Record<
        IndicatorToggleKey,
        boolean
      >,
    }));
  }, []);

  const setMarkerRange = useCallback((markerRange: MarkerRange) => {
    setState((prev) => (prev.markerRange === markerRange ? prev : { ...prev, markerRange }));
  }, []);

  return { toggles, set, applyPreset, markerRange, setMarkerRange };
}
