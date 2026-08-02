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

export type TrainerExitReason = 'stop' | 'target' | 'manual' | 'horizon';

export interface TrainerTradeLot {
  time: string;
  price: number;
  size: number;
}

export interface TrainerPositionLot extends TrainerTradeLot {
  remaining: number;
}

export interface TrainerTradeExit {
  time: string;
  price: number;
  size: number;
  reason: TrainerExitReason;
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

// Two fields move on their own and must not be recomputed by a reader. `riskUnit` locks at the
// first fill and never changes again, so R stays comparable across adds; `entryPrice` is the
// weighted average of the lots still open, which an add moves and a reduce does not. It is the
// breakeven line TD-EXIT-01 is measured against, so an add can turn a stop that was legal illegal.
export interface TrainerPosition {
  tradeId: number;
  direction: TrainerDirection;
  decisionBar: number;
  decisionTime: string;
  lots: TrainerPositionLot[];
  exits: TrainerTradeExit[];
  entryPrice: number;
  entryTime: string;
  initialStop: number;
  riskUnit: number;
  realizedR: number;
  realizedFrictionR: number;
  stop: number;
  target: number;
  holdingBars: number;
  mfeR: number;
  maeR: number;
  entryReason: TrainerReason;
}

// `entry` / `exit` are the size-weighted averages of `lots` / `exits`, kept so a reader that only
// wants one price per trade still has one. `lots` / `exits` are optional because answers recorded
// before position sizing existed carry neither; a live episode always writes both.
export interface TrainerClosedTrade {
  tradeId: number;
  direction: TrainerDirection;
  decisionBar: number;
  decisionTime: string;
  entry: TrainerExecution;
  exit: TrainerExecution;
  lots?: TrainerTradeLot[];
  exits?: TrainerTradeExit[];
  exitReason: TrainerExitReason;
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

export type TrainerFillTrigger = 'manual' | 'pool-read' | 'session-end';
export type TrainerFillStatus = 'running' | 'done' | 'failed' | 'aborted';

// `ai-pick` belongs to the AI selection gate, which lands a phase later than the
// rest of this contract. Its slot is defined up front so shipping that gate needs
// no contract change; until then no task row ever carries it.
export type TrainerFillPhase =
  'sample' | 'hard-rule-gate' | 'assemble' | 'ai-pick' | 'anonymize' | 'audit';

export interface TrainerFillTask {
  id: string;
  basePeriod: TrainerBasePeriod;
  requested: number;
  trigger: TrainerFillTrigger;
  status: TrainerFillStatus;
  phase: TrainerFillPhase;
  activity: string;
  admitted: number;
  error: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface TrainerFillState {
  task: TrainerFillTask | null;
  // Two separate flags because the card says different things: one is "you turned
  // it off", the other is "it kept failing and stood down".
  autoRefillEnabled: boolean;
  autoRefillSuspended: boolean;
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

export const TRAINER_CASE_TAGS = [
  'trend-follow',
  'pullback-entry',
  'false-breakout',
  'top-reversal',
  'range-bound',
] as const;

export type TrainerCaseTag = (typeof TRAINER_CASE_TAGS)[number];

// The trainer's own outcomes on top of the replay scorer's five: `abstained` is an AI that
// declined to take a side, which is neither a right nor a wrong direction and must not land in
// either half of the accuracy ratio.
export type TrainerCoachOutcome =
  'win' | 'loss' | 'timeout_flat' | 'no_fill' | 'format_violation' | 'abstained';

// What the trader's own book said at the moment they asked. Derived from engine state rather
// than sent by the renderer: the whole comparison rests on this snapshot being the judgement
// they actually held, so it must not be something a caller can restate after the fact.
export interface TrainerCoachStance {
  direction: TrainerDirection | 'neutral';
  entry: number | null;
  stop: number | null;
  target: number | null;
}

// `aligned` is excluded from the persuaded/held comparison on purpose: counting an AI that
// agreed with the trader as an AI that moved them would water the contrast down to nothing.
export type TrainerCoachAgreement = 'aligned' | 'persuaded' | 'held';

export interface TrainerCoachVerdict {
  outcome: TrainerCoachOutcome;
  /** The plan's own reward-to-risk, before the market had a say. */
  plannedRewardRisk: number | null;
  /** What the plan actually collected, in R. */
  realizedR: number | null;
  directionCorrect: boolean;
  /** Null where the trader had taken no side to compare against — see `humanBefore`. */
  agreement: TrainerCoachAgreement | null;
  judgedAt: string;
}

// `skipped` is stored rather than left absent so "looked at it, nothing wrong" stays
// distinguishable from "never looked".
export type TrainerAnnotationVerdict =
  'sound' | 'right_call_wrong_reason' | 'unfounded' | 'skipped';

export interface TrainerAnnotation {
  verdict: TrainerAnnotationVerdict;
  at: string;
}

// `step` is the engine's own monotonic action counter, captured when the question was asked.
// The attribution window for "did this change their mind" runs from this step to the next
// call's — `cursor` cannot carry it, because submitting and cancelling leave the cursor where
// it was, so two calls on the same bar would claim the same change.
export interface TrainerCoachCall {
  id: string;
  cursor: number;
  step: number;
  askedAt: string;
  model: string;
  /**
   * Null when they asked before taking any side. The AI is reachable from the first bar, so a
   * call may legitimately predate any view of their own; the persuaded/held comparison then has
   * no second term and is skipped rather than filled in with a default.
   */
  humanBefore: TrainerCoachStance | null;
  ai: TrainerSubmission;
  verdict: TrainerCoachVerdict | null;
  annotation: TrainerAnnotation | null;
}

// `syncedAt` is null while the lesson lives only in the training area. Nothing writes
// `journal/lessons.md` without the trader pressing the button — a synthetic, price-scaled,
// news-free board teaches two different kinds of thing, and only one of them belongs in the
// list that gates real trades.
export interface TrainerLesson {
  text: string;
  writtenAt: string;
  syncedAt: string | null;
}

export type TrainerReviewEventKind =
  'entry' | 'stop' | 'target' | 'manual_exit' | 'horizon_exit' | 'coach';

export interface TrainerReviewEvent {
  kind: TrainerReviewEventKind;
  at: string;
  /** Index into `replay`, or null when the moment falls outside the playable segment. */
  barIndex: number | null;
  price: number | null;
  label: string;
  coachId?: string;
}

// The stop-out's overshoot is measured against the stop the trade was carrying when it was hit,
// and `reachedTargetAfter` scans the remaining playable bars only — the epilogue is barred from
// every counted number, here as everywhere else.
export interface TrainerStopAutopsy {
  tradeId: number;
  stop: number;
  overshoot: number;
  overshootPct: number;
  reachedTargetAfter: boolean;
}

export interface TrainerReviewFacts {
  stopAutopsy: TrainerStopAutopsy | null;
  /** Where the last trade would have stood at the end of the epilogue. Observation only. */
  holdToEpilogueEndR: number | null;
  /** Best and worst the epilogue reached after the trader was out, in R. Observation only. */
  afterExitHighR: number | null;
  afterExitLowR: number | null;
}

export interface TrainerReviewPayload {
  sessionId: string;
  caseId: string;
  symbol: string;
  basePeriod: TrainerBasePeriod;
  ladder: readonly [TrainerViewPeriod, TrainerViewPeriod, TrainerViewPeriod];
  provenance: TrainerProvenance;
  tag: TrainerCaseTag | null;
  /**
   * Base-period bars handed over before the first playable one — the chart's left half. The
   * review chart is base-period only: the brush slices these bars directly, and re-deriving the
   * ladder's upper tiers on the renderer would put a second copy of the aggregation rule there,
   * free to drift from the one the episode was actually settled on.
   */
  lookback: RawBar[];
  /** The whole playable segment, fog included. */
  replay: RawBar[];
  epilogue: RawBar[];
  /** Cursor the trader stopped at; bars past it were never seen during the session. */
  playedThrough: number;
  trades: TrainerClosedTrade[];
  result: TrainerResult | null;
  events: TrainerReviewEvent[];
  coach: TrainerCoachCall[];
  facts: TrainerReviewFacts;
  lesson: TrainerLesson | null;
}

// Every block reports `samples` whether or not it is locked, so a locked card can still say how
// far off it is. When `locked` is true the ratios are null rather than zero — a missing number
// and a measured zero are different answers.
export interface TrainerStatBlock {
  samples: number;
  locked: boolean;
}

export interface TrainerOverviewStats extends TrainerStatBlock {
  netR: number;
  winRate: number | null;
  plannedRewardRisk: number | null;
  realizedRewardRisk: number | null;
  mfeGivebackRate: number | null;
}

export interface TrainerTagStats extends TrainerStatBlock {
  tag: TrainerCaseTag | null;
  netR: number;
  winRate: number | null;
}

export interface TrainerStopHealthStats extends TrainerStatBlock {
  reachedTargetAfterStopRate: number | null;
  averageOvershootPct: number | null;
}

export interface TrainerCoachInfluenceStats extends TrainerStatBlock {
  persuadedCount: number;
  persuadedWinRate: number | null;
  heldCount: number;
  heldWinRate: number | null;
}

export interface TrainerAdvanceStyleStats extends TrainerStatBlock {
  barByBarWinRate: number | null;
  fastForwardWinRate: number | null;
}

// `samples` counts every call, which is the guard's unit; `settled` counts the ones the market
// actually resolved, which is the accuracy ratio's denominator. Reporting only the first would
// let "52% over 21 calls" hide the fact that 21 calls produced four scored plans.
export interface TrainerCoachScorecard extends TrainerStatBlock {
  settled: number;
  annotated: number;
  directionAccuracy: number | null;
  soundReasonRate: number | null;
  rightCallWrongReasonRate: number | null;
}

export interface TrainerStats {
  completedSessions: number;
  unfinishedSessions: number;
  sessionsByBasePeriod: Record<TrainerBasePeriod, number>;
  overview: TrainerOverviewStats;
  byTag: TrainerTagStats[];
  stopHealth: TrainerStopHealthStats;
  coachInfluence: TrainerCoachInfluenceStats;
  advanceStyle: TrainerAdvanceStyleStats;
  coachScorecard: TrainerCoachScorecard;
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

// Sizes are fractions of a full position within (0, 1]; a `reduce` without one closes everything
// still open, which is what `exit_next_open` already does.
export type TrainerAction =
  | { type: 'hold'; bars?: number; period?: TrainerAdvancePeriod; reason?: TrainerReason }
  | { type: 'amend'; stop?: number; target?: number; reason: TrainerReason }
  | { type: 'cancel'; reason: TrainerReason }
  | { type: 'exit_next_open'; reason: TrainerReason }
  | { type: 'add'; size: number; reason: TrainerReason }
  | { type: 'reduce'; size?: number; reason: TrainerReason };

export interface TrainerApi {
  listPool(): TrainerPoolCounts;
  getFill(): TrainerFillState;
  startFill(input: { basePeriod: TrainerBasePeriod; count: number }): TrainerFillTask;
  abortFill(input: { id: string }): TrainerFillTask;
  setAutoRefill(input: { enabled: boolean }): TrainerFillState;
  open(input: { basePeriod: TrainerBasePeriod }): TrainerOpened;
  resume(input: { sessionId: string }): TrainerOpened;
  submit(input: {
    sessionId: string;
    submission: TrainerSubmission;
    entryMode: TrainerEntryMode;
    size?: number;
  }): TrainerStepResult;
  step(input: { sessionId: string; action: TrainerAction; bars?: number }): TrainerStepResult;
  amend(input: {
    sessionId: string;
    stop?: number;
    target?: number;
    reason: TrainerReason;
  }): TrainerStepResult;
  validateAmend(input: { sessionId: string; stop?: number; target?: number }): TrainerAmendCheck;
  cancel(input: { sessionId: string; reason: TrainerReason }): TrainerStepResult;
  exitNextOpen(input: { sessionId: string; reason: TrainerReason }): TrainerStepResult;
  add(input: { sessionId: string; size: number; reason: TrainerReason }): TrainerStepResult;
  reduce(input: { sessionId: string; size?: number; reason: TrainerReason }): TrainerStepResult;
  reveal(input: { sessionId: string }): TrainerReveal;
  coach(input: { sessionId: string }): TrainerCoachCall;
  annotate(input: {
    sessionId: string;
    coachId: string;
    verdict: TrainerAnnotationVerdict;
  }): TrainerCoachCall;
  review(input: { sessionId: string }): TrainerReviewPayload;
  stats(): TrainerStats;
  saveLesson(input: { sessionId: string; text: string }): TrainerLesson;
  syncLesson(input: { sessionId: string }): TrainerLesson;
}

// TRAINER_GUARDRAIL is a legal move the risk boundary refused — a stop that gives back a booked
// gain (TD-EXIT-01), an add beyond a full position — and belongs in front of the trader. Every
// other code is a caller or environment fault and belongs in front of a developer. Collapsing them
// would either hide a refusal the trader must answer or dress a bug as trading advice.
export type TrainerErrorCode =
  'TRAINER_GUARDRAIL' | 'TRAINER_PROTOCOL' | 'TRAINER_POOL_EMPTY' | 'LICENSE_REQUIRED';

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
