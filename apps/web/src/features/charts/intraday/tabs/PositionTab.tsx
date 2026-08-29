import * as stylex from '@stylexjs/stylex';
import type { PositionView } from '@kansoku/shared/types';
import { fmt, signed, upDown } from '@web/lib/format';
import { SectionTitle } from '@web/ui';
import { colors, fontSizes } from '../../../../theme/tokens.stylex';

const styles = stylex.create({
  grid: {
    display: 'grid',
    fontSize: fontSizes.base,
    gap: '6px 10px',
    gridTemplateColumns: 'auto 1fr',
  },
  key: { color: colors.textSecondary },
  value: {
    color: colors.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
  },
  valueUp: {
    color: colors.up,
  },
  valueDown: {
    color: colors.down,
  },
});

interface PositionTabProps {
  position: PositionView | null;
}

export function PositionTab({ position }: PositionTabProps) {
  if (!position) return null;
  const tone = upDown(position.unrealized);

  return (
    <>
      <SectionTitle>持仓视角</SectionTitle>
      <div className={`grid2 ${stylex.props(styles.grid).className}`}>
        <div className={`k ${stylex.props(styles.key).className}`}>持仓</div>
        <div className={`v ${stylex.props(styles.value).className}`}>{position.shares} sh</div>
        <div className={`k ${stylex.props(styles.key).className}`}>成本</div>
        <div className={`v ${stylex.props(styles.value).className}`}>${fmt(position.cost)}</div>
        <div className={`k ${stylex.props(styles.key).className}`}>
          浮{position.unrealized >= 0 ? '盈' : '亏'}
        </div>
        <div
          className={`v ${tone} ${stylex.props(styles.value, tone === 'up' ? styles.valueUp : styles.valueDown).className}`}
        >
          {signed(position.unrealized)} ({signed(position.unrealizedPct)}%)
        </div>
      </div>
    </>
  );
}
