import type { TrainerReviewFacts as Facts } from '@kansoku/pro-api';
import { fmt, signed } from '@web/lib/format';

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
    <div className="trainer-review-facts" data-testid="trainer-review-facts">
      <div className="trainer-label">实盘做不到的三个数</div>
      <div className="trainer-review-figs">
        <figure className="trainer-fig">
          <figcaption>被止损那笔超出多少</figcaption>
          <div className={`num trainer-fig-val${autopsy ? ' down' : ''}`}>
            {autopsy ? `-${fmt(autopsy.overshoot)}` : '—'}
          </div>
          <div className="trainer-fig-sub">
            {autopsy
              ? `占止损价 ${fmt(autopsy.overshootPct)}%，之后${autopsy.reachedTargetAfter ? '到过' : '没到过'}目标`
              : '本局没有被止损'}
          </div>
        </figure>
        <figure className="trainer-fig">
          <figcaption>不平仓拿到尾声段末</figcaption>
          <div className="num trainer-fig-val">
            {facts.holdToEpilogueEndR === null ? '—' : signed(facts.holdToEpilogueEndR)}
            <span className="trainer-fig-unit"> R</span>
          </div>
          <div className="trainer-fig-sub">仅供观察，不计成绩</div>
        </figure>
        <figure className="trainer-fig">
          <figcaption>离场后最高 / 最低</figcaption>
          <div className="num trainer-fig-val">
            {facts.afterExitHighR === null ? '—' : signed(facts.afterExitHighR)}
            {' / '}
            {facts.afterExitLowR === null ? '—' : signed(facts.afterExitLowR)}
            <span className="trainer-fig-unit"> R</span>
          </div>
          <div className="trainer-fig-sub">你走之后市场还给过什么</div>
        </figure>
      </div>
    </div>
  );
}
