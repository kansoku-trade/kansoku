import type { RawBar } from '@kansoku/shared/types';

export type TrainerBasePeriod = '1m' | '5m' | '15m' | '30m' | '1h';
export type TrainerViewPeriod = TrainerBasePeriod | 'day' | 'week';
export type TrainerPhase = 'flat' | 'pending' | 'open' | 'terminal';
export type TrainerDirection = 'long' | 'short';
export type TrainerEntryMode = 'limit' | 'market';

export type TrainerEvent =
  | 'observed'
  | 'abstained'
  | 'waiting_fill'
  | 'filled'
  | 'holding'
  | 'cancelled'
  | 'no_fill'
  | 'stop_hit'
  | 'target_hit'
  | 'manual_exit'
  | 'horizon_exit';

export type TrainerReasonCategory =
  | 'trend_following'
  | 'breakout'
  | 'pullback'
  | 'mean_reversion'
  | 'support_resistance'
  | 'momentum'
  | 'volume_flow'
  | 'volatility'
  | 'news_event'
  | 'fundamental'
  | 'risk_management'
  | 'thesis_invalidated'
  | 'profit_protection'
  | 'time_horizon'
  | 'no_setup'
  | 'other';

export interface TrainerReason {
  category: TrainerReasonCategory;
  summary: string;
}

export interface TrainerExecution {
  time: string;
  price: number;
}

export interface TrainerOrder {
  tradeId: number;
  direction: TrainerDirection;
  decisionBar: number;
  decisionTime: string;
  entry: number;
  initialStop: number;
  stop: number;
  target: number;
  waitedBars: number;
  entryReason: TrainerReason;
  entryMode: TrainerEntryMode;
}

export interface TrainerPosition {
  tradeId: number;
  direction: TrainerDirection;
  decisionBar: number;
  decisionTime: string;
  entryPrice: number;
  entryTime: string;
  initialStop: number;
  initialRisk: number;
  stop: number;
  target: number;
  holdingBars: number;
  mfeR: number;
  maeR: number;
  entryReason: TrainerReason;
}

export interface TrainerClosedTrade {
  tradeId: number;
  direction: TrainerDirection;
  decisionBar: number;
  decisionTime: string;
  entry: TrainerExecution;
  exit: TrainerExecution;
  exitReason: 'stop' | 'target' | 'manual' | 'horizon';
  initialStop: number;
  finalStop: number;
  target: number;
  initialRisk: number;
  grossR: number;
  frictionR: number;
  netR: number;
  mfeR: number;
  maeR: number;
  holdingBars: number;
  entryReason?: TrainerReason;
}

export type TrainerTerminationReason =
  | 'abstain'
  | 'no_decision'
  | 'cancelled'
  | 'no_fill'
  | 'stop'
  | 'target'
  | 'manual'
  | 'horizon'
  | 'no_trade';

export interface TrainerResult {
  terminationReason: TrainerTerminationReason;
  direction: TrainerDirection | 'neutral';
  entry: TrainerExecution | null;
  exit: TrainerExecution | null;
  initialRisk: number | null;
  grossR: number | null;
  frictionR: number | null;
  netR: number | null;
  mfeR: number | null;
  maeR: number | null;
  holdingBars: number;
  steps: number;
  trades?: TrainerClosedTrade[];
  tradeCount?: number;
  winCount?: number;
  lossCount?: number;
  maxDrawdownR?: number;
}

export interface TrainerLadderBars {
  base: RawBar[];
  mid: RawBar[];
  top: RawBar[];
}

export interface TrainerView {
  caseId: string;
  symbol: string;
  basePeriod: TrainerBasePeriod;
  ladder: readonly [TrainerViewPeriod, TrainerViewPeriod, TrainerViewPeriod];
  cursor: number;
  asOf: string;
  bars: TrainerLadderBars;
  quote: Record<string, unknown>;
  phase: TrainerPhase;
  order: TrainerOrder | null;
  position: TrainerPosition | null;
  trades: TrainerClosedTrade[];
  netR: number;
  remainingBars: number;
  terminal: boolean;
  result: TrainerResult | null;
}

export interface TrainerStepEvent {
  barOffset: number;
  cursor: number;
  at: string;
  event: TrainerEvent;
}

export interface TrainerStepResult {
  view: TrainerView;
  events: TrainerStepEvent[];
  advancedBars: number;
  terminal: boolean;
  result: TrainerResult | null;
}

export interface TrainerPoolCounts {
  total: number;
  byBasePeriod: Record<TrainerBasePeriod, number>;
}

export interface TrainerOpened {
  sessionId: string;
  view: TrainerView;
}

export interface TrainerProvenance {
  outputId: string;
  aliasSymbol: string;
  sourceId: string;
  sourceSymbol: string;
  sourceCutoff: string;
  syntheticCutoff: string;
  dayShift: number;
  priceScale: number;
  volumeScale: number;
}

export interface TrainerReveal {
  provenance: TrainerProvenance;
  epilogue: RawBar[];
}

export interface TrainerAnchor {
  timeframe: 'm5' | 'm15' | 'h1' | 'day';
  time: string;
  price: number;
}

export interface TrainerEntryPlan {
  entry: number;
  stop: number;
  target1?: number;
  target2?: number;
  target1_pct?: number;
  target2_pct?: number;
  note?: string;
  rationale?: string;
}

export interface TrainerScenario {
  label: string;
  probability: number;
  trigger?: string;
  path?: string;
}

export interface TrainerSubmission {
  direction: TrainerDirection | 'neutral';
  anchor: TrainerAnchor;
  entry_plan?: TrainerEntryPlan;
  scenarios: TrainerScenario[];
  decision_reason?: TrainerReason;
  comment: string;
}

// A refused amendment is the answer, not a transport failure, so this rides home on `ok: true`.
// The envelope's `ok: false` stays reserved for the caller getting the question itself wrong —
// an unknown session, an unreadable case — which is not something the trader can act on.
export interface TrainerAmendCheck {
  allowed: boolean;
  code: TrainerErrorCode | null;
  error: string | null;
}

export type TrainerAdvancePeriod = TrainerViewPeriod | 'h1';

export type TrainerAction =
  | { type: 'hold'; bars?: number; period?: TrainerAdvancePeriod; reason?: TrainerReason }
  | { type: 'amend'; stop?: number; target?: number; reason: TrainerReason }
  | { type: 'cancel'; reason: TrainerReason }
  | { type: 'exit_next_open'; reason: TrainerReason };

export interface TrainerApi {
  listPool(): TrainerPoolCounts;
  open(input: { basePeriod: TrainerBasePeriod }): TrainerOpened;
  resume(input: { sessionId: string }): TrainerOpened;
  submit(input: {
    sessionId: string;
    submission: TrainerSubmission;
    entryMode: TrainerEntryMode;
  }): TrainerStepResult;
  step(input: { sessionId: string; action: TrainerAction; bars?: number }): TrainerStepResult;
  amend(input: {
    sessionId: string;
    stop?: number;
    target?: number;
    reason: TrainerReason;
  }): TrainerStepResult;
  validateAmend(input: {
    sessionId: string;
    stop?: number;
    target?: number;
  }): TrainerAmendCheck;
  cancel(input: { sessionId: string; reason: TrainerReason }): TrainerStepResult;
  exitNextOpen(input: { sessionId: string; reason: TrainerReason }): TrainerStepResult;
  reveal(input: { sessionId: string }): TrainerReveal;
}

// TRAINER_GUARDRAIL is a legal move the risk boundary refused (TD-EXIT-01) and belongs in front of
// the trader; every other code is a caller or environment fault and belongs in front of a developer.
// Collapsing them would either hide a refusal the trader must answer or dress a bug as trading advice.
export type TrainerErrorCode =
  | 'TRAINER_GUARDRAIL'
  | 'TRAINER_PROTOCOL'
  | 'TRAINER_POOL_EMPTY'
  | 'LICENSE_REQUIRED';

// A refused step may still have advanced the episode part of the way, so a failure carries the
// session's actual state whenever one could be read. Renderers must adopt this view instead of
// keeping the one they held before the call.
export interface TrainerFailure {
  ok: false;
  error: string;
  code: TrainerErrorCode;
  status: number;
  view?: TrainerView | null;
}

export type TrainerEnvelope<T> = { ok: true; data: T } | TrainerFailure;

export type WrapTrainerEnvelope<Api> = {
  [K in keyof Api]: Api[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<TrainerEnvelope<Awaited<R>>>
    : never;
};
