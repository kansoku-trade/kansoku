import type { EpisodeTradeReasonCategory } from '../schema/tradeReason.js';

export type ToneClass = 'positive' | 'negative' | 'neutral';

export const PLAYSTYLE_LABEL: Record<string, string> = {
  'single-shot': 'oneshot',
  episode: 'walkthrough',
};

export const TERMINATION_LABELS: Record<string, string> = {
  abstain: '观望',
  no_decision: '未决策',
  cancelled: '取消订单',
  no_fill: '未成交',
  stop: '止损',
  target: '止盈',
  manual: '主动退出',
  horizon: '到期平仓',
  no_trade: '全程空仓',
};

export const DIRECTION_LABELS: Record<string, string> = {
  long: '做多',
  short: '做空',
  neutral: '观望',
};

export const MODE_LABELS: Record<string, string> = { blind: '盲盘', live: '实盘' };

export const REASON_LABELS: Record<EpisodeTradeReasonCategory, string> = {
  trend_following: '趋势跟随',
  breakout: '突破',
  pullback: '回调入场',
  mean_reversion: '均值回归',
  support_resistance: '支撑阻力',
  momentum: '动量',
  volume_flow: '量价与资金流',
  volatility: '波动率',
  news_event: '新闻事件',
  fundamental: '基本面',
  risk_management: '风险管理',
  thesis_invalidated: '逻辑失效',
  profit_protection: '利润保护',
  time_horizon: '时间窗口',
  no_setup: '无有效机会',
  other: '其他',
};

export const ACTION_LABELS: Record<string, string> = {
  submit: '提交',
  hold: '持有',
  amend: '改单',
  cancel: '撤单',
  exit_next_open: '主动退出',
};

export const EVENT_LABELS: Record<string, string> = {
  observed: '已公开下一根',
  decision_due: '决策窗口即将截止',
  no_decision: '决策窗口已截止',
  waiting_fill: '挂单等待成交',
  filled: '订单已成交',
  holding: '继续持仓',
  amended: '计划已调整',
  cancelled: '订单已取消',
  target_hit: '止盈命中',
  stop_hit: '止损命中',
  manual_exit: '主动退出',
  horizon_exit: '回放到期退出',
  abstained: '选择观望',
};

export const PHASE_LABELS: Record<string, string> = {
  flat: '空仓',
  observing: '观察期',
  awaiting_submission: '等待决策',
  waiting_fill: '待成交',
  pending: '待成交',
  submitted: '已提交',
  active: '持仓中',
  open: '持仓中',
  position: '持仓中',
  terminal: '已终结',
  completed: '已完成',
};

export function phaseLabel(phase: string | null): string {
  if (!phase) return '—';
  return PHASE_LABELS[phase] ?? phase;
}

export function valueClass(value: number | null | undefined): ToneClass {
  if (value == null || value === 0) return 'neutral';
  return value > 0 ? 'positive' : 'negative';
}

export function fmt(value: number | null | undefined, digits = 2): string {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}

export function fmtSigned(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

export function fmtPercent(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(digits)}%`;
}

export function fmtUsd(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : `$${value.toFixed(value < 1 ? 3 : 2)}`;
}

export function fmtDuration(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value < 1_000 ? `${Math.round(value)} ms` : `${(value / 1_000).toFixed(1)} s`;
}
