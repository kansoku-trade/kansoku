import { INDICATOR_TOGGLE_KEYS, INDICATOR_TOGGLE_LABELS, type IndicatorToggleKey } from "./useIndicatorToggles";

interface IndicatorTogglesProps {
  toggles: Record<IndicatorToggleKey, boolean>;
  onToggle: (key: IndicatorToggleKey) => void;
}

export function IndicatorToggles({ toggles, onToggle }: IndicatorTogglesProps) {
  return (
    <div className="chart-indicator-toggles" aria-label="指标显示切换">
      {INDICATOR_TOGGLE_KEYS.map((key) => (
        <button
          key={key}
          aria-pressed={toggles[key]}
          onClick={() => onToggle(key)}
          title={INDICATOR_TOGGLE_LABELS[key]}
        >
          {INDICATOR_TOGGLE_LABELS[key]}
        </button>
      ))}
    </div>
  );
}
