import { formatClockInZone, localTimeZone } from '@kansoku/shared/time';
import * as stylex from '@stylexjs/stylex';
import { useFeature } from '@web/features/edition/useFeature';
import { useSymbolFollow } from '@web/features/quotes/useSymbolFollow';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import { useFollowTick } from './useFollowTick';

const styles = stylex.create({
  root: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    marginTop: '6px',
    marginBottom: '6px',
  },
});

export function AliveLine({ symbol, revision }: { symbol: string; revision?: string }) {
  const { active } = useFeature('symbol-follow');
  const { following } = useSymbolFollow({ symbol, revision });
  const enabled = active && following === true;
  const tick = useFollowTick(symbol, enabled);

  if (!enabled || !tick) return null;

  return (
    <div className={`ai-alive-line ${stylex.props(styles.root).className}`}>
      跟进中 · 上次检测 {formatClockInZone(tick.at, localTimeZone())}
    </div>
  );
}
