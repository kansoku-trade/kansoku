import type { MacdStructureKind, MacdStructureSignal } from '@kansoku/shared/types';

const DOUBLE_CROSS_WINDOW = 45;
const TANGLE_WINDOW = 40;
const TANGLE_MIN_CROSSINGS = 4;
const CONFIRM_BARS = 2;
const NEAR_ZERO_RATIO = 0.12;

export const MACD_STRUCTURE_META: Record<
  MacdStructureKind,
  { label: string; bias: 'bullish' | 'bearish'; color: string; implication: string }
> = {
  golden_above: {
    label: '零上金叉',
    bias: 'bullish',
    color: '#26a69a',
    implication: '多头趋势中的回调结束，上涨延续概率大，可靠性高',
  },
  golden_below: {
    label: '零下金叉',
    bias: 'bullish',
    color: '#26a69a',
    implication:
      '下跌途中的超跌反弹，通常只是修复，反弹后仍可能回落；反转需等二次金叉或 DIF 上穿零轴',
  },
  death_above: {
    label: '零上死叉',
    bias: 'bearish',
    color: '#ef5350',
    implication: '上涨中的回调警告，趋势未必转坏，关注回调深度与零轴支撑',
  },
  death_below: {
    label: '零下死叉',
    bias: 'bearish',
    color: '#ef5350',
    implication: '空头趋势延续，下跌可能加速，不宜抄底',
  },
  double_golden_below: {
    label: '二次金叉',
    bias: 'bullish',
    color: '#00e676',
    implication: '零下二次金叉且低点抬高——底部结构确认，反转概率显著上升，比单次金叉可靠得多',
  },
  double_golden_above: {
    label: '空中加油',
    bias: 'bullish',
    color: '#00e676',
    implication: '零上二次金叉（回调不破零轴再度金叉）——强势延续，常开启第二波上涨',
  },
  double_death_above: {
    label: '二次死叉',
    bias: 'bearish',
    color: '#ff1744',
    implication: '零上二次死叉且高点降低——顶部结构确认，转跌概率显著上升',
  },
  double_death_below: {
    label: '二次死叉',
    bias: 'bearish',
    color: '#ff1744',
    implication: '零下二次死叉——空头中继，下跌延续甚至加速',
  },
  zero_cross_up: {
    label: '上穿零轴',
    bias: 'bullish',
    color: '#58a6ff',
    implication: 'DIF 上穿零轴——中期动能由空转多的确认信号，比金叉滞后但更可靠',
  },
  zero_cross_down: {
    label: '下穿零轴',
    bias: 'bearish',
    color: '#58a6ff',
    implication: 'DIF 下穿零轴——中期动能由多转空的确认信号',
  },
};

export const ZERO_TANGLE_NOTE =
  '⚠️ 当前 DIF 贴近零轴反复缠绕（震荡市），交叉信号可靠性下降，宜用区间打法';

export interface MacdStructure {
  signals: MacdStructureSignal[];
  tangle: boolean;
}

export function classifyMacdStructure(
  dif: (number | null)[],
  hist: (number | null)[],
  timesTs: number[],
): MacdStructure {
  const n = hist.length;

  interface Cross {
    i: number;
    type: 'golden' | 'death';
  }
  const crosses: Cross[] = [];
  let prevH: number | null = null;
  for (let i = 0; i < n; i++) {
    const h = hist[i];
    if (h === null) continue;
    if (prevH !== null) {
      if (prevH <= 0 && h > 0) crosses.push({ i, type: 'golden' });
      else if (prevH >= 0 && h < 0) crosses.push({ i, type: 'death' });
    }
    prevH = h;
  }

  let maxAbsDif = 0;
  for (const d of dif) {
    if (d !== null && Math.abs(d) > maxAbsDif) maxAbsDif = Math.abs(d);
  }
  const eps = maxAbsDif * NEAR_ZERO_RATIO;

  const rangeDif = (from: number, to: number, isMax: boolean) => {
    let best = isMax ? -Infinity : Infinity;
    for (let i = from; i <= to; i++) {
      const d = dif[i];
      if (d === null) continue;
      if (isMax ? d > best : d < best) best = d;
    }
    return best;
  };

  const signals: MacdStructureSignal[] = [];
  const push = (kind: MacdStructureKind, i: number, confirmed: boolean) => {
    const meta = MACD_STRUCTURE_META[kind];
    signals.push({
      kind,
      time: timesTs[i],
      dif: dif[i] ?? 0,
      bias: meta.bias,
      label: meta.label,
      implication: meta.implication,
      confirmed,
    });
  };

  let lastGolden: Cross | null = null;
  let lastDeath: Cross | null = null;
  for (const c of crosses) {
    const d = dif[c.i] ?? 0;
    let kind: MacdStructureKind;
    if (c.type === 'golden') {
      kind = d >= 0 ? 'golden_above' : 'golden_below';
      if (lastGolden && c.i - lastGolden.i <= DOUBLE_CROSS_WINDOW) {
        const dPrev = dif[lastGolden.i] ?? 0;
        if (d < eps && dPrev < eps) {
          const troughBetween = rangeDif(lastGolden.i, c.i, false);
          const troughBefore = rangeDif(
            Math.max(0, lastGolden.i - DOUBLE_CROSS_WINDOW),
            lastGolden.i,
            false,
          );
          if (troughBetween > troughBefore) kind = 'double_golden_below';
        } else if (d >= -eps && dPrev >= -eps && rangeDif(lastGolden.i, c.i, false) >= -eps) {
          kind = 'double_golden_above';
        }
      }
      lastGolden = c;
    } else {
      kind = d >= 0 ? 'death_above' : 'death_below';
      if (lastDeath && c.i - lastDeath.i <= DOUBLE_CROSS_WINDOW) {
        const dPrev = dif[lastDeath.i] ?? 0;
        if (d > -eps && dPrev > -eps) {
          const peakBetween = rangeDif(lastDeath.i, c.i, true);
          const peakBefore = rangeDif(
            Math.max(0, lastDeath.i - DOUBLE_CROSS_WINDOW),
            lastDeath.i,
            true,
          );
          if (peakBetween < peakBefore) kind = 'double_death_above';
        } else if (d < eps && dPrev < eps) {
          kind = 'double_death_below';
        }
      }
      lastDeath = c;
    }
    push(kind, c.i, true);
  }

  const zeroCrossings: { i: number; up: boolean }[] = [];
  let prevD: number | null = null;
  for (let i = 0; i < n; i++) {
    const d = dif[i];
    if (d === null) continue;
    if (prevD !== null) {
      if (prevD < 0 && d >= 0) zeroCrossings.push({ i, up: true });
      else if (prevD > 0 && d <= 0) zeroCrossings.push({ i, up: false });
    }
    prevD = d;
  }
  for (const z of zeroCrossings) {
    const isRecent = z.i >= n - CONFIRM_BARS;
    let holds = true;
    for (let j = z.i + 1; j <= Math.min(n - 1, z.i + CONFIRM_BARS); j++) {
      const d = dif[j];
      if (d === null) continue;
      if (z.up ? d < 0 : d > 0) {
        holds = false;
        break;
      }
    }
    if (!holds && !isRecent) continue;
    push(z.up ? 'zero_cross_up' : 'zero_cross_down', z.i, holds && !isRecent);
  }

  signals.sort((a, b) => a.time - b.time);

  const tangleStart = Math.max(0, n - TANGLE_WINDOW);
  const tangle = zeroCrossings.filter((z) => z.i >= tangleStart).length >= TANGLE_MIN_CROSSINGS;

  return { signals, tangle };
}
