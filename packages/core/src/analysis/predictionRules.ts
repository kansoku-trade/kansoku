import type { IntradayPrediction, LensScores } from '@kansoku/shared/types';

const SCENARIO_SUM_TOLERANCE = 10;
const MIN_T1_RR = 1;
const LENS_KEYS = ['m5', 'm15', 'h1', 'day'] as const;
const MIN_ALIGNED_SUM = 4;
const MAX_OPPOSING_LENSES = 1;

function validLensScores(scores: LensScores | undefined): scores is LensScores {
  return (
    scores != null &&
    LENS_KEYS.every((key) => {
      const value = scores[key];
      return Number.isInteger(value) && value >= -5 && value <= 5;
    })
  );
}

export function lensResonance(
  scores: LensScores,
  direction: 'long' | 'short',
): { alignedSum: number; opposing: number } {
  const sign = direction === 'long' ? 1 : -1;
  let alignedSum = 0;
  let opposing = 0;
  for (const key of LENS_KEYS) {
    const aligned = scores[key] * sign;
    alignedSum += aligned;
    if (aligned <= -1) opposing += 1;
  }
  return { alignedSum, opposing };
}

function resolveTarget(
  entry: number,
  direction: 'long' | 'short',
  target: number | undefined,
  targetPct: number | undefined,
): number | null {
  if (target != null && Number.isFinite(target)) return target;
  if (targetPct != null && Number.isFinite(targetPct)) {
    const sign = direction === 'long' ? 1 : -1;
    return entry * (1 + (sign * targetPct) / 100);
  }
  return null;
}

export function validatePrediction(prediction: IntradayPrediction): string[] {
  const issues: string[] = [];
  const { direction, entry_plan: plan, scenarios, anchor } = prediction;

  if (
    !anchor ||
    !anchor.timeframe ||
    typeof anchor.time !== 'string' ||
    !anchor.time ||
    typeof anchor.price !== 'number' ||
    !Number.isFinite(anchor.price)
  ) {
    issues.push('anchor 必填——没有锚点（周期/时间/价格）的预测事后无法对账');
  }

  if (!scenarios || scenarios.length < 2 || scenarios.length > 4) {
    issues.push('scenarios 必须给 2 到 4 个情景');
  }
  if (scenarios) {
    const sum = scenarios.reduce((acc, s) => acc + s.probability, 0);
    if (Math.abs(sum - 100) > SCENARIO_SUM_TOLERANCE) {
      issues.push(`情景概率之和应约为 100（0–100 百分数），当前为 ${sum}`);
    }
  }

  const falsifiers = (prediction.invalidation ?? []).filter(
    (item) => typeof item === 'string' && item.trim().length > 0,
  );
  if (falsifiers.length === 0) {
    issues.push(
      'invalidation 必填——写明什么条件会证伪这个论点（跌破某价、结构破坏、事件落地等），至少一条，空字符串不算',
    );
  }

  const scores = prediction.lens_scores;
  if (scores == null) {
    issues.push(
      'lens_scores 必填——m5 / m15 / h1 / day 各给一个 −5（强烈看空）到 +5（强烈看多）的整数分，0 表示该周期无信号',
    );
  } else if (!validLensScores(scores)) {
    issues.push('lens_scores 每项必须是 −5 到 +5 的整数');
  }

  if (direction !== 'long' && direction !== 'short' && direction !== 'neutral') {
    issues.push('direction 必须是 long / short / neutral');
    return issues;
  }

  if (direction === 'neutral') {
    if (plan) {
      issues.push(
        'neutral（观望）不应提交 entry_plan——去掉入场/止损/目标，两侧条件应对写进 range_plan',
      );
    }
    const rp = prediction.range_bound_plan ?? prediction.range_plan;
    const low = Number(rp?.low);
    const high = Number(rp?.high);
    if (!Number.isFinite(low) || !Number.isFinite(high) || !(low < high)) {
      issues.push(
        'neutral 必须在 range_plan 里给出箱体下沿 low / 上沿 high（low < high）——否则观望判断事后无法对账',
      );
    } else if (anchor && (anchor.price < low || anchor.price > high)) {
      issues.push('观望箱体应包住锚点价格——锚点价在区间外说明区间画错了或方向不该是 neutral');
    }
    return issues;
  }

  if (direction === 'long' || direction === 'short') {
    if (validLensScores(scores)) {
      const { alignedSum, opposing } = lensResonance(scores, direction);
      if (alignedSum <= 0) {
        issues.push(
          `方向与镜头分自相矛盾——direction 为 ${direction} 但四镜头按方向折算合计 ${alignedSum} ≤ 0，先把分析理顺再提交`,
        );
      } else if (alignedSum < MIN_ALIGNED_SUM || opposing > MAX_OPPOSING_LENSES) {
        issues.push(
          `多镜头共振不足——按方向折算合计 ${alignedSum}（需 ≥ ${MIN_ALIGNED_SUM}），反向镜头 ${opposing} 个（最多 ${MAX_OPPOSING_LENSES} 个）；要么转 neutral 观望，要么重做分析`,
        );
      }
    }
    if (!plan) {
      issues.push('long / short 必须给出 entry_plan（入场、止损、目标）');
      return issues;
    }
    const { entry, stop } = plan;
    if (!Number.isFinite(entry) || !Number.isFinite(stop)) {
      issues.push('entry_plan 的 entry / stop 必须是数字');
      return issues;
    }
    const risk = direction === 'long' ? entry - stop : stop - entry;
    if (risk <= 0) {
      issues.push(direction === 'long' ? '做多止损必须低于入场价' : '做空止损必须高于入场价');
    }
    const t1 = resolveTarget(entry, direction, plan.target1, plan.target1_pct);
    const t2 = resolveTarget(entry, direction, plan.target2, plan.target2_pct);
    if (t1 == null) {
      issues.push(
        'long / short 必须给出 target1 或 target1_pct——没有目标价就无法核对盈亏比，也无法事后对账',
      );
    } else {
      const reward1 = direction === 'long' ? t1 - entry : entry - t1;
      if (reward1 <= 0) {
        issues.push(
          direction === 'long' ? '做多 target1 必须高于入场价' : '做空 target1 必须低于入场价',
        );
      } else if (risk > 0 && reward1 / risk < MIN_T1_RR) {
        issues.push(
          `T1 口径盈亏比 ${(reward1 / risk).toFixed(2)}:1 不足 ${MIN_T1_RR}:1——换结构重做入场/止损，或转 neutral`,
        );
      }
    }
    if (t2 != null) {
      const reward2 = direction === 'long' ? t2 - entry : entry - t2;
      if (reward2 <= 0) {
        issues.push(
          direction === 'long' ? '做多 target2 必须高于入场价' : '做空 target2 必须低于入场价',
        );
      }
    }
  }

  return issues;
}
