import { createContext, use, type ReactNode } from 'react';
import { INDICATOR_STORAGE_KEY, useIndicatorToggles } from './useIndicatorToggles';
import { MA_LINES_STORAGE_KEY, useMaLines, type MaLinesApi } from './useMaLines';
import { TIMEFRAMES_STORAGE_KEY, useVisibleTimeframes, type TimeframesApi } from './timeframes';

type IntradayControls = ReturnType<typeof useIndicatorToggles> & MaLinesApi & TimeframesApi;

const ControlsContext = createContext<IntradayControls | null>(null);

export function namespacedKey(key: string, storageNamespace: string | undefined): string {
  return storageNamespace ? `${storageNamespace}-${key}` : key;
}

export function IntradayControlsProvider({
  children,
  storageNamespace,
}: {
  children: ReactNode;
  storageNamespace?: string;
}) {
  const indicators = useIndicatorToggles(namespacedKey(INDICATOR_STORAGE_KEY, storageNamespace));
  const ma = useMaLines(namespacedKey(MA_LINES_STORAGE_KEY, storageNamespace));
  const timeframes = useVisibleTimeframes(namespacedKey(TIMEFRAMES_STORAGE_KEY, storageNamespace));
  return (
    <ControlsContext value={{ ...indicators, ...ma, ...timeframes }}>{children}</ControlsContext>
  );
}

export function useIntradayControls(): IntradayControls {
  const controls = use(ControlsContext);
  if (!controls) {
    throw new Error('useIntradayControls 必须在 IntradayControlsProvider 内使用');
  }
  return controls;
}
