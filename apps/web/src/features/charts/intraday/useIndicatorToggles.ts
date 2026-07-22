import { useCallback, useEffect, useState } from 'react';
import type { FeatureKey } from '@kansoku/pro-api/features';
import { theme } from '@web/lib/theme';

export type IndicatorToggleKey =
  | 'crosses'
  | 'divergence'
  | 'macdBeichi'
  | 'pattern123'
  | 'sb'
  | 'candle'
  | 'ai'
  | 'levels'
  | 'fvg'
  | 'ema'
  | 'vwap'
  | 'daylevel'
  | 'optwall'
  | 'chanFenxing'
  | 'chanBi'
  | 'chanXianduan'
  | 'chanZhongshu'
  | 'chanBuySell1'
  | 'chanBuySell2'
  | 'chanBuySell3';

const BASE_TOGGLE_ORDER: IndicatorToggleKey[] = [
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
  'macdBeichi',
  'candle',
  'ai',
];

export const CHAN_STRUCTURE_TOGGLE_KEYS: IndicatorToggleKey[] = [
  'chanFenxing',
  'chanBi',
  'chanXianduan',
  'chanZhongshu',
];

export const CHAN_BUYSELL_TOGGLE_KEYS: IndicatorToggleKey[] = [
  'chanBuySell1',
  'chanBuySell2',
  'chanBuySell3',
];

export const INDICATOR_TOGGLE_ORDER: IndicatorToggleKey[] = [
  ...BASE_TOGGLE_ORDER,
  ...CHAN_STRUCTURE_TOGGLE_KEYS,
  ...CHAN_BUYSELL_TOGGLE_KEYS,
];

export const INDICATOR_TOGGLE_LABELS: Record<IndicatorToggleKey, string> = {
  crosses: '金叉死叉',
  divergence: '自动背离',
  macdBeichi: 'MACD 背离（K 线级）',
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
  chanFenxing: '分型',
  chanBi: '笔',
  chanXianduan: '线段',
  chanZhongshu: '中枢',
  chanBuySell1: '一类',
  chanBuySell2: '二类',
  chanBuySell3: '三类',
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
  macdBeichi: theme.textSecondary,
  candle: theme.accent,
  ai: theme.accent,
  chanFenxing: theme.accent,
  chanBi: theme.accent,
  chanXianduan: theme.accent,
  chanZhongshu: '#808080',
  chanBuySell1: theme.up,
  chanBuySell2: theme.up,
  chanBuySell3: theme.up,
};

export const INDICATOR_TOGGLE_KEYS = INDICATOR_TOGGLE_ORDER;

export const INDICATOR_FEATURE_GATES: Partial<Record<IndicatorToggleKey, FeatureKey>> = {
  divergence: 'auto-patterns',
  macdBeichi: 'auto-patterns',
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
  { key: 'all', label: '全部', on: [...BASE_TOGGLE_ORDER] },
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
      toggles: Object.fromEntries(
        INDICATOR_TOGGLE_KEYS.map((k) => [
          k,
          BASE_TOGGLE_ORDER.includes(k) ? wanted.has(k) : prev.toggles[k],
        ]),
      ) as Record<IndicatorToggleKey, boolean>,
    }));
  }, []);

  const setMarkerRange = useCallback((markerRange: MarkerRange) => {
    setState((prev) => (prev.markerRange === markerRange ? prev : { ...prev, markerRange }));
  }, []);

  return { toggles, set, applyPreset, markerRange, setMarkerRange };
}
