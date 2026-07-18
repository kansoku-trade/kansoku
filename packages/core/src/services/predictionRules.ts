import type { IntradayPrediction } from '@kansoku/shared/types';

const SCENARIO_SUM_TOLERANCE = 10;
const MIN_T1_RR = 1;

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
