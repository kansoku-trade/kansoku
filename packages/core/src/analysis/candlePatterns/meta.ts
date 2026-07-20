import type { CandlePatternKind } from '@kansoku/shared/types';

export const CANDLE_PATTERN_META: Record<
  CandlePatternKind,
  { label: string; bias: 'bullish' | 'bearish' | 'neutral'; strong: boolean; implication: string }
> = {
  bullish_engulfing: {
    label: '看涨吞没',
    bias: 'bullish',
    strong: true,
    implication:
      '下跌后阳线实体完全吞没前一根阴线——买方接管，短线反转向上信号；下一根不破吞没线低点则有效',
  },
  bearish_engulfing: {
    label: '看跌吞没',
    bias: 'bearish',
    strong: true,
    implication:
      '上涨后阴线实体完全吞没前一根阳线——卖方接管，短线反转向下信号；下一根不破吞没线高点则有效',
  },
  morning_star: {
    label: '启明星',
    bias: 'bullish',
    strong: true,
    implication:
      '大阴线 + 小实体星线驻底 + 大阳线收复过半——经典三根 K 线底部反转组合，比单根信号更可靠',
  },
  evening_star: {
    label: '黄昏星',
    bias: 'bearish',
    strong: true,
    implication:
      '大阳线 + 小实体星线滞涨 + 大阴线跌破过半——经典三根 K 线顶部反转组合，比单根信号更可靠',
  },
  hammer: {
    label: '锤子线',
    bias: 'bullish',
    strong: false,
    implication: '下跌末端长下影小实体——低位被买盘拉回，止跌信号；下一根收在锤子实体上方则确认',
  },
  hanging_man: {
    label: '上吊线',
    bias: 'bearish',
    strong: false,
    implication:
      '上涨末端出现长下影小实体——盘中曾被大幅打压，多头开始不稳的警示；跌破其低点则确认转弱',
  },
  inverted_hammer: {
    label: '倒锤子',
    bias: 'bullish',
    strong: false,
    implication:
      '下跌末端长上影小实体——买方开始试探性上攻，反转苗头；需下一根阳线确认，可靠性低于锤子线',
  },
  shooting_star: {
    label: '射击之星',
    bias: 'bearish',
    strong: false,
    implication: '上涨末端长上影小实体——冲高被抛压砸回，见顶警示；跌破其低点则确认',
  },
  pin_bar_lower: {
    label: '下影针线',
    bias: 'bullish',
    strong: false,
    implication:
      '横盘中扎出局部新低的长下影小实体——区间下沿被买盘拒绝；无趋势背景，强度低于锤子线，需下一根收在实体上方确认',
  },
  pin_bar_upper: {
    label: '上影针线',
    bias: 'bearish',
    strong: false,
    implication:
      '横盘中冲出局部新高的长上影小实体——区间上沿被抛压拒绝；无趋势背景，强度低于射击之星，需下一根收在实体下方确认',
  },
  dark_cloud_cover: {
    label: '乌云盖顶',
    bias: 'bearish',
    strong: false,
    implication:
      '阴线高开后深入前一根阳线实体过半——上攻动能被吞噬，看跌反转信号，强度略弱于看跌吞没',
  },
  piercing_line: {
    label: '刺透形态',
    bias: 'bullish',
    strong: false,
    implication: '阳线低开后收复前一根阴线实体过半——买方强力反击，看涨反转信号，强度略弱于看涨吞没',
  },
  bullish_harami: {
    label: '看涨孕线',
    bias: 'bullish',
    strong: false,
    implication: '大阴线后小实体完全孕于其中——抛压衰竭的警示信号，方向未定，需后续阳线确认后才可信',
  },
  bearish_harami: {
    label: '看跌孕线',
    bias: 'bearish',
    strong: false,
    implication: '大阳线后小实体完全孕于其中——买盘衰竭的警示信号，方向未定，需后续阴线确认后才可信',
  },
  three_white_soldiers: {
    label: '红三兵',
    bias: 'bullish',
    strong: true,
    implication:
      '连续三根步步高的中大阳线——买方持续控盘，底部反转或强势延续；若出现在大涨后高位则谨防力竭',
  },
  three_black_crows: {
    label: '三只乌鸦',
    bias: 'bearish',
    strong: true,
    implication: '连续三根步步低的中大阴线——卖方持续控盘，顶部反转或弱势延续信号，杀伤力大',
  },
  doji: {
    label: '十字星',
    bias: 'neutral',
    strong: false,
    implication: '开盘收盘几乎持平——多空力量暂时均衡，方向未定，需看下一根确认走向',
  },
  long_legged_doji: {
    label: '长腿十字',
    bias: 'neutral',
    strong: false,
    implication: '上下影线都很长但开收几乎持平——盘中剧烈拉锯却收平，分歧加剧的信号，方向未定',
  },
  gravestone_doji: {
    label: '墓碑十字',
    bias: 'bearish',
    strong: false,
    implication:
      '上涨末端冲高后又跌回开盘价附近——上攻力量被完全抛压吞噬，见顶警示；跌破其低点则确认转弱',
  },
  dragonfly_doji: {
    label: '蜻蜓十字',
    bias: 'bullish',
    strong: false,
    implication:
      '下跌末端探底后又收回开盘价附近——抛压被买盘完全接住，止跌信号；下一根收在高点上方则确认',
  },
  tweezer_top: {
    label: '镊子顶',
    bias: 'bearish',
    strong: false,
    implication:
      '上涨末端连续两根 K 线在几乎同一高点受阻——同一价位反复被抛压压制，见顶警示；跌破前一根低点则确认',
  },
  tweezer_bottom: {
    label: '镊子底',
    bias: 'bullish',
    strong: false,
    implication:
      '下跌末端连续两根 K 线在几乎同一低点获支撑——同一价位反复被买盘接住，止跌信号；突破前一根高点则确认',
  },
  bullish_marubozu: {
    label: '光头大阳',
    bias: 'bullish',
    strong: false,
    implication:
      '开盘即最低、收盘即最高的大阳实体——买方全程控盘无回撤，强势信号；次日低开或收阴则转弱',
  },
  bearish_marubozu: {
    label: '光头大阴',
    bias: 'bearish',
    strong: false,
    implication:
      '开盘即最高、收盘即最低的大阴实体——卖方全程控盘无反抽，弱势信号；次日高开或收阳则转弱',
  },
};
