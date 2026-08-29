import * as stylex from '@stylexjs/stylex';
import type { SymbolAnalysisRow } from '@kansoku/shared/types';
import { formatMarketMonthDayTime } from '@kansoku/shared/time';
import { DIRECTION_LABEL } from '@web/features/charts/intraday/directionLabels';
import { fontSizes } from '../../theme/tokens.stylex';
import { Select } from '@web/ui';
import type { AnalysisViewMode } from './analysisMode';

const LIVE_VALUE = '__live_view__';
const LATEST_VALUE = '__latest_analysis__';

const styles = stylex.create({
  trigger: {
    height: '26px',
    paddingInline: '7px',
    fontSize: fontSizes.sm,
  },
});

export function AnalysisTimeline({
  rows,
  activeId,
  mode,
  onLive,
  onSelect,
}: {
  rows: SymbolAnalysisRow[];
  activeId: string | null;
  mode: AnalysisViewMode;
  onLive: () => void;
  onSelect: (id: string | null) => void;
}) {
  if (rows.length === 0) return null;
  const options = [
    { value: LIVE_VALUE, label: '实时' },
    { value: LATEST_VALUE, label: '最新' },
    ...rows.map((row) => ({
      value: row.id,
      label: `${formatMarketMonthDayTime(row.created_at)}${row.direction ? ` · ${DIRECTION_LABEL[row.direction]}` : ''}`,
    })),
  ];
  return (
    <Select
      className={stylex.props(styles.trigger).className}
      value={
        mode === 'live' ? LIVE_VALUE : mode === 'latest' ? LATEST_VALUE : (activeId ?? LATEST_VALUE)
      }
      options={options}
      onChange={(value) => {
        if (value === LIVE_VALUE) onLive();
        else onSelect(value === LATEST_VALUE ? null : value);
      }}
    />
  );
}
