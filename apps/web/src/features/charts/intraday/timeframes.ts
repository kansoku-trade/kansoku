import { useCallback, useEffect, useState } from 'react';
import type { IntradayBuilt, IntradayTfData, TimeframeKey } from '@kansoku/shared/types';

export type ViewPeriod = '1m' | '30m' | 'day' | 'week' | 'month';
export type ChartTf = TimeframeKey | ViewPeriod;

export const ANALYSIS_TFS: TimeframeKey[] = ['m5', 'm15', 'h1'];

export interface TfOption {
  key: ChartTf;
  short: string;
  label: string;
  analysis: boolean;
}

export const TF_OPTIONS: TfOption[] = [
  { key: '1m', short: '1m', label: '1 分钟', analysis: false },
  { key: 'm5', short: '5m', label: '5 分钟', analysis: true },
  { key: 'm15', short: '15m', label: '15 分钟', analysis: true },
  { key: '30m', short: '30m', label: '30 分钟', analysis: false },
  { key: 'h1', short: '1h', label: '1 小时', analysis: true },
  { key: 'day', short: '日', label: '日线', analysis: false },
  { key: 'week', short: '周', label: '周线', analysis: false },
  { key: 'month', short: '月', label: '月线', analysis: false },
];

const TF_ORDER = TF_OPTIONS.map((o) => o.key);
const TF_KEYS = new Set<string>(TF_ORDER);
const ANALYSIS_SET = new Set<string>(ANALYSIS_TFS);

export const tfLabel = (tf: ChartTf): string =>
  TF_OPTIONS.find((o) => o.key === tf)?.label ?? String(tf);

export const tfShortLabel = (tf: ChartTf): string =>
  TF_OPTIONS.find((o) => o.key === tf)?.short ?? String(tf);

export const isViewPeriod = (tf: ChartTf): tf is ViewPeriod => !ANALYSIS_SET.has(tf);

const SESSIONLESS = new Set<string>(['day', 'week', 'month']);

export const isSessionlessTf = (tf: ChartTf): boolean => SESSIONLESS.has(tf);

export const tfDataOf = (built: IntradayBuilt, tf: ChartTf): IntradayTfData | undefined =>
  (built.timeframes as Record<string, IntradayTfData | undefined>)[tf];

export function withViewTimeframe(
  built: IntradayBuilt,
  tf: ChartTf,
  data: IntradayTfData | null,
): IntradayBuilt {
  if (!data || !isViewPeriod(tf)) return built;
  return {
    ...built,
    timeframes: { ...built.timeframes, [tf]: data } as IntradayBuilt['timeframes'],
  };
}

export function withPreviewLevels(
  built: IntradayBuilt,
  levels: IntradayBuilt['previewLevels'],
): IntradayBuilt {
  if (!levels || levels.length === 0) return built;
  return { ...built, previewLevels: levels };
}

const STORAGE_KEY = 'intraday-timeframes';

export function sanitizeTimeframes(raw: unknown): ChartTf[] {
  const picked = Array.isArray(raw)
    ? raw.filter((k): k is ChartTf => TF_KEYS.has(k as string))
    : [];
  const wanted = new Set<ChartTf>([...picked, ...ANALYSIS_TFS]);
  return TF_ORDER.filter((k) => wanted.has(k));
}

function loadStored(): ChartTf[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...ANALYSIS_TFS];
    return sanitizeTimeframes(JSON.parse(raw));
  } catch {
    return [...ANALYSIS_TFS];
  }
}

export interface TimeframesApi {
  visibleTfs: ChartTf[];
  toggleTf: (tf: ChartTf) => void;
}

export function useVisibleTimeframes(): TimeframesApi {
  const [visibleTfs, setVisibleTfs] = useState(loadStored);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleTfs));
  }, [visibleTfs]);

  const toggleTf = useCallback((tf: ChartTf) => {
    if (ANALYSIS_SET.has(tf)) return;
    setVisibleTfs((prev) =>
      sanitizeTimeframes(prev.includes(tf) ? prev.filter((k) => k !== tf) : [...prev, tf]),
    );
  }, []);

  return { visibleTfs, toggleTf };
}
