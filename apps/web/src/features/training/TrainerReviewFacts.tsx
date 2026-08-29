import type { TrainerReviewFacts as Facts } from '@kansoku/pro-api';
import * as stylex from '@stylexjs/stylex';
import { fmt, signed } from '@web/lib/format';
import { colors, fontSizes, fonts } from '../../theme/tokens.stylex';

const styles = stylex.create({
  facts: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  figures: {
    display: 'grid',
    gap: '8px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
  },
  figure: {
    backgroundColor: colors.backgroundSurface,
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    margin: 0,
    padding: '12px 15px',
  },
  figureCaption: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  figureValue: {
    fontFamily: fonts.mono,
    fontSize: '26px',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
    letterSpacing: '-0.02em',
    lineHeight: 1.15,
  },
  figureValueDown: {
    color: colors.down,
  },
  figureUnit: {
    color: colors.textMuted,
    fontSize: fontSizes.lg,
  },
  figureSub: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
});

/**
 * The three numbers a live account cannot produce, because a live account has no parallel world in
 * which the trade was left alone.
 *
 * Every one of them reads through the epilogue, and none of them enters a statistic. "Holding would
 * have paid +3.6R" is true of this board and silent about the boards where holding wipes you out;
 * the caption says so rather than leaving the number to be read as a lesson.
 */
export function TrainerReviewFacts({ facts }: { facts: Facts }) {
  const autopsy = facts.stopAutopsy;
  return (
    <div
      className={`trainer-review-facts ${stylex.props(styles.facts).className}`}
      data-testid="trainer-review-facts"
    >
      <div className={`trainer-label ${stylex.props(styles.label).className}`}>
        实盘做不到的三个数
      </div>
      <div className={`trainer-review-figs ${stylex.props(styles.figures).className}`}>
        <figure className={`trainer-fig ${stylex.props(styles.figure).className}`}>
          <figcaption className={stylex.props(styles.figureCaption).className}>
            被止损那笔超出多少
          </figcaption>
          <div
            className={`num trainer-fig-val ${stylex.props(styles.figureValue, autopsy && styles.figureValueDown).className}`}
          >
            {autopsy ? `-${fmt(autopsy.overshoot)}` : '—'}
          </div>
          <div className={`trainer-fig-sub ${stylex.props(styles.figureSub).className}`}>
            {autopsy
              ? `占止损价 ${fmt(autopsy.overshootPct)}%，之后${autopsy.reachedTargetAfter ? '到过' : '没到过'}目标`
              : '本局没有被止损'}
          </div>
        </figure>
        <figure className={`trainer-fig ${stylex.props(styles.figure).className}`}>
          <figcaption className={stylex.props(styles.figureCaption).className}>
            不平仓拿到尾声段末
          </figcaption>
          <div className={`num trainer-fig-val ${stylex.props(styles.figureValue).className}`}>
            {facts.holdToEpilogueEndR === null ? '—' : signed(facts.holdToEpilogueEndR)}
            <span className={`trainer-fig-unit ${stylex.props(styles.figureUnit).className}`}>
              {' '}
              R
            </span>
          </div>
          <div className={`trainer-fig-sub ${stylex.props(styles.figureSub).className}`}>
            仅供观察，不计成绩
          </div>
        </figure>
        <figure className={`trainer-fig ${stylex.props(styles.figure).className}`}>
          <figcaption className={stylex.props(styles.figureCaption).className}>
            离场后最高 / 最低
          </figcaption>
          <div className={`num trainer-fig-val ${stylex.props(styles.figureValue).className}`}>
            {facts.afterExitHighR === null ? '—' : signed(facts.afterExitHighR)}
            {' / '}
            {facts.afterExitLowR === null ? '—' : signed(facts.afterExitLowR)}
            <span className={`trainer-fig-unit ${stylex.props(styles.figureUnit).className}`}>
              {' '}
              R
            </span>
          </div>
          <div className={`trainer-fig-sub ${stylex.props(styles.figureSub).className}`}>
            你走之后市场还给过什么
          </div>
        </figure>
      </div>
    </div>
  );
}
