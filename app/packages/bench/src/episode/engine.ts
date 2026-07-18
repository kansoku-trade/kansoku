import type { RawBar } from "../../../../shared/types.js";
import type {
  EpisodeAction,
  EpisodeActionRecord,
  EpisodeClosedTrade,
  EpisodeTradeAction,
  EpisodeTradeResult,
} from "../schema/episode.js";
import type { Question } from "../schema/question.js";
import type { Submission } from "../schema/submission.js";

export type EpisodePhase = "flat" | "pending" | "open" | "terminal";
export type EpisodeEvent =
  | "observed"
  | "abstained"
  | "waiting_fill"
  | "filled"
  | "holding"
  | "cancelled"
  | "no_fill"
  | "stop_hit"
  | "target_hit"
  | "manual_exit"
  | "horizon_exit";

export interface PendingOrderState {
  tradeId: number;
  direction: "long" | "short";
  decisionBar: number;
  decisionTime: string;
  entry: number;
  initialStop: number;
  stop: number;
  target: number;
  waitedBars: number;
}

export interface PositionState {
  tradeId: number;
  direction: "long" | "short";
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
}

export interface EpisodeState {
  phase: EpisodePhase;
  cursor: number;
  steps: number;
  decisionBar: number | null;
  decisionTime: string | null;
  initialSubmission: Submission | null;
  order: PendingOrderState | null;
  position: PositionState | null;
  trades: EpisodeClosedTrade[];
  nextTradeId: number;
  actions: EpisodeActionRecord[];
  result: EpisodeTradeResult | null;
}

export interface EpisodeEngineOptions {
  costBps?: number;
}

export interface EpisodeAdvanceResult {
  state: EpisodeState;
  asOf: string;
  bar: RawBar | null;
  event: EpisodeEvent;
  terminal: boolean;
  result: EpisodeTradeResult | null;
}

function numberOf(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

function finite(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite number`);
  return parsed;
}

function replayLength(question: Question): number {
  return Math.min(question.replay.horizonBars, question.replay.bars.length);
}

function replayBar(question: Question, cursor: number): RawBar | null {
  if (cursor < 0 || cursor >= replayLength(question)) return null;
  return question.replay.bars[cursor] ?? null;
}

function currentAsOf(question: Question, cursor: number): string {
  return replayBar(question, cursor)?.time ?? question.cutoff;
}

export function remainingEpisodeBars(state: EpisodeState, question: Question): number {
  return Math.max(0, replayLength(question) - state.cursor - 1);
}

export function episodeNetR(state: EpisodeState): number {
  return state.trades.reduce((total, trade) => total + trade.netR, 0);
}

function actionRecord(
  state: EpisodeState,
  question: Question,
  action: EpisodeAction,
  nextBar: RawBar | null,
  tradeId: number | null = null,
): EpisodeActionRecord {
  return {
    step: state.steps + 1,
    tradeId,
    at: currentAsOf(question, state.cursor),
    effectiveBarTime: nextBar?.time ?? null,
    action,
  };
}

function withAction(
  state: EpisodeState,
  question: Question,
  action: EpisodeAction,
  nextBar: RawBar | null,
  tradeId: number | null = null,
): EpisodeState {
  return {
    ...state,
    steps: state.steps + 1,
    actions: [...state.actions, actionRecord(state, question, action, nextBar, tradeId)],
  };
}

function maxClosedTradeDrawdown(trades: readonly EpisodeClosedTrade[]): number {
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const trade of trades) {
    equity += trade.netR;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  return maxDrawdown;
}

function terminalResult(state: EpisodeState): EpisodeTradeResult {
  const first = state.trades.at(0) ?? null;
  const last = state.trades.at(-1) ?? null;
  const grossR = state.trades.reduce((total, trade) => total + trade.grossR, 0);
  const frictionR = state.trades.reduce((total, trade) => total + trade.frictionR, 0);
  const netR = state.trades.reduce((total, trade) => total + trade.netR, 0);
  const wins = state.trades.filter((trade) => trade.netR > 0).length;
  const losses = state.trades.filter((trade) => trade.netR < 0).length;

  return {
    terminationReason: state.trades.length === 0 ? "no_trade" : "horizon",
    direction: last?.direction ?? "neutral",
    entry: first?.entry ?? null,
    exit: last?.exit ?? null,
    initialRisk: first?.initialRisk ?? null,
    grossR,
    frictionR,
    netR,
    mfeR: state.trades.length > 0 ? Math.max(...state.trades.map((trade) => trade.mfeR)) : null,
    maeR: state.trades.length > 0 ? Math.max(...state.trades.map((trade) => trade.maeR)) : null,
    holdingBars: state.trades.reduce((total, trade) => total + trade.holdingBars, 0),
    steps: state.steps,
    decisionBar: state.decisionBar,
    decisionTime: state.decisionTime,
    observationBars: state.decisionBar ?? state.cursor + 1,
    trades: state.trades,
    tradeCount: state.trades.length,
    winCount: wins,
    lossCount: losses,
    maxDrawdownR: maxClosedTradeDrawdown(state.trades),
    actions: state.actions,
  };
}

function finishAtHorizon(
  state: EpisodeState,
  event: EpisodeEvent,
  asOf: string,
  bar: RawBar | null,
): EpisodeAdvanceResult {
  const result = terminalResult(state);
  const terminalState: EpisodeState = {
    ...state,
    phase: "terminal",
    order: null,
    position: null,
    result,
  };
  return { state: terminalState, asOf, bar, event, terminal: true, result };
}

function validateDirectionalSubmission(
  submission: Submission,
  tradeId: number,
  decisionBar: number,
  decisionTime: string,
): PendingOrderState {
  if (submission.direction === "neutral") throw new Error("neutral submission has no order");
  const plan = submission.entry_plan;
  if (!plan || plan.target1 == null) throw new Error("directional submission requires entry, stop, and target1");

  const entry = finite(plan.entry, "entry");
  const stop = finite(plan.stop, "stop");
  const target = finite(plan.target1, "target1");
  const wrongStop = submission.direction === "long" ? stop >= entry : stop <= entry;
  const wrongTarget = submission.direction === "long" ? target <= entry : target >= entry;
  if (wrongStop) throw new Error(`invalid ${submission.direction} stop`);
  if (wrongTarget) throw new Error(`invalid ${submission.direction} target`);

  return {
    tradeId,
    direction: submission.direction,
    decisionBar,
    decisionTime,
    entry,
    initialStop: stop,
    stop,
    target,
    waitedBars: 0,
  };
}

export function createEpisodeState(): EpisodeState {
  return {
    phase: "flat",
    cursor: -1,
    steps: 0,
    decisionBar: null,
    decisionTime: null,
    initialSubmission: null,
    order: null,
    position: null,
    trades: [],
    nextTradeId: 1,
    actions: [],
    result: null,
  };
}

export function submitEpisode(
  state: EpisodeState,
  question: Question,
  submission: Submission,
  _options: EpisodeEngineOptions = {},
): EpisodeAdvanceResult {
  if (state.phase === "terminal") throw new Error("episode already terminated");
  if (state.phase !== "flat") throw new Error("a new prediction is only valid while flat");
  if (remainingEpisodeBars(state, question) === 0) throw new Error("episode has no unrevealed replay bar");

  const decisionBar = state.cursor + 1;
  const decisionTime = currentAsOf(question, state.cursor);
  const plan = submission.entry_plan;
  const recorded = withAction(
    state,
    question,
    {
      type: "submit",
      direction: submission.direction,
      ...(plan ? { entry: plan.entry, stop: plan.stop, ...(plan.target1 == null ? {} : { target: plan.target1 }) } : {}),
    },
    replayBar(question, state.cursor + 1),
    submission.direction === "neutral" ? null : state.nextTradeId,
  );

  if (submission.direction === "neutral") {
    return {
      state: recorded,
      asOf: decisionTime,
      bar: null,
      event: "abstained",
      terminal: false,
      result: null,
    };
  }

  const order = validateDirectionalSubmission(
    submission,
    state.nextTradeId,
    decisionBar,
    decisionTime,
  );
  const submitted: EpisodeState = {
    ...recorded,
    phase: "pending",
    decisionBar: state.decisionBar ?? decisionBar,
    decisionTime: state.decisionTime ?? decisionTime,
    initialSubmission: state.initialSubmission ?? submission,
    order,
    nextTradeId: state.nextTradeId + 1,
  };

  return {
    state: submitted,
    asOf: decisionTime,
    bar: null,
    event: "waiting_fill",
    terminal: false,
    result: null,
  };
}

function visibleReferencePrice(question: Question, state: EpisodeState): number {
  const visible = replayBar(question, state.cursor);
  if (visible) return numberOf(visible.close);
  const quote = Number((question.fixtures.quote as { last?: unknown }).last);
  if (Number.isFinite(quote)) return quote;
  const day = question.fixtures.kline.day ?? [];
  const last = day.at(-1);
  if (!last) throw new Error("cannot resolve current visible price");
  return numberOf(last.close);
}

function applyAmendment(
  position: PositionState,
  action: Extract<EpisodeTradeAction, { type: "amend" }>,
  reference: number,
): PositionState {
  if (action.stop == null && action.target == null) throw new Error("amend requires stop or target");
  const stop = action.stop == null ? position.stop : finite(action.stop, "stop");
  const target = action.target == null ? position.target : finite(action.target, "target");
  const wrongStop = position.direction === "long" ? stop >= reference : stop <= reference;
  const wrongTarget = position.direction === "long" ? target <= reference : target >= reference;
  if (wrongStop) throw new Error(`amended ${position.direction} stop crosses the visible price`);
  if (wrongTarget) throw new Error(`amended ${position.direction} target crosses the visible price`);
  return { ...position, stop, target };
}

function updateExcursions(position: PositionState, bar: RawBar): PositionState {
  const high = numberOf(bar.high);
  const low = numberOf(bar.low);
  const favorable = position.direction === "long" ? high - position.entryPrice : position.entryPrice - low;
  const adverse = position.direction === "long" ? position.entryPrice - low : high - position.entryPrice;
  return {
    ...position,
    holdingBars: position.holdingBars + 1,
    mfeR: Math.max(position.mfeR, favorable / position.initialRisk, 0),
    maeR: Math.max(position.maeR, adverse / position.initialRisk, 0),
  };
}

function stopHit(position: PositionState, bar: RawBar): boolean {
  return position.direction === "long" ? numberOf(bar.low) <= position.stop : numberOf(bar.high) >= position.stop;
}

function targetHit(position: PositionState, bar: RawBar): boolean {
  return position.direction === "long" ? numberOf(bar.high) >= position.target : numberOf(bar.low) <= position.target;
}

function stopExitPrice(position: PositionState, bar: RawBar, allowOpenGap = true): number {
  const open = numberOf(bar.open);
  if (allowOpenGap && position.direction === "long" && open < position.stop) return open;
  if (allowOpenGap && position.direction === "short" && open > position.stop) return open;
  return position.stop;
}

function targetExitPrice(position: PositionState, bar: RawBar, allowOpenGap = true): number {
  const open = numberOf(bar.open);
  if (allowOpenGap && position.direction === "long" && open > position.target) return open;
  if (allowOpenGap && position.direction === "short" && open < position.target) return open;
  return position.target;
}

interface EntryFill {
  price: number;
  timing: "open" | "intrabar";
}

function entryFill(order: PendingOrderState, reference: number, bar: RawBar): EntryFill | null {
  const open = numberOf(bar.open);
  const high = numberOf(bar.high);
  const low = numberOf(bar.low);

  if (order.direction === "long") {
    const isStopEntry = order.entry >= reference;
    if (isStopEntry) {
      if (open >= order.entry) return { price: open, timing: "open" };
      return high >= order.entry ? { price: order.entry, timing: "intrabar" } : null;
    }
    if (open <= order.entry) return { price: open, timing: "open" };
    return low <= order.entry ? { price: order.entry, timing: "intrabar" } : null;
  }

  const isStopEntry = order.entry <= reference;
  if (isStopEntry) {
    if (open <= order.entry) return { price: open, timing: "open" };
    return low <= order.entry ? { price: order.entry, timing: "intrabar" } : null;
  }
  if (open >= order.entry) return { price: open, timing: "open" };
  return high >= order.entry ? { price: order.entry, timing: "intrabar" } : null;
}

function bracketCrossedAtFill(
  position: PositionState,
): EpisodeClosedTrade["exitReason"] | null {
  if (position.direction === "long") {
    if (position.entryPrice <= position.stop) return "stop";
    if (position.entryPrice >= position.target) return "target";
    return null;
  }
  if (position.entryPrice >= position.stop) return "stop";
  if (position.entryPrice <= position.target) return "target";
  return null;
}

function closePosition(
  state: EpisodeState,
  exitReason: EpisodeClosedTrade["exitReason"],
  exit: { time: string; price: number },
  options: EpisodeEngineOptions,
): EpisodeState {
  const position = state.position;
  if (!position) throw new Error("cannot close an empty position");
  const grossR = position.direction === "long"
    ? (exit.price - position.entryPrice) / position.initialRisk
    : (position.entryPrice - exit.price) / position.initialRisk;
  const costRate = (options.costBps ?? 0) / 10_000;
  const frictionR = (costRate * (position.entryPrice + exit.price)) / position.initialRisk;
  const trade: EpisodeClosedTrade = {
    tradeId: position.tradeId,
    direction: position.direction,
    decisionBar: position.decisionBar,
    decisionTime: position.decisionTime,
    entry: { time: position.entryTime, price: position.entryPrice },
    exit,
    exitReason,
    initialStop: position.initialStop,
    finalStop: position.stop,
    target: position.target,
    initialRisk: position.initialRisk,
    grossR,
    frictionR,
    netR: grossR - frictionR,
    mfeR: position.mfeR,
    maeR: position.maeR,
    holdingBars: position.holdingBars,
  };
  return {
    ...state,
    phase: "flat",
    position: null,
    trades: [...state.trades, trade],
  };
}

function advanceFlat(
  state: EpisodeState,
  question: Question,
  action: Extract<EpisodeAction, { type: "hold" | "observe" }>,
): EpisodeAdvanceResult {
  const nextCursor = state.cursor + 1;
  const bar = replayBar(question, nextCursor);
  if (!bar) throw new Error("episode has no next replay bar");
  const working: EpisodeState = {
    ...withAction(state, question, action, bar),
    cursor: nextCursor,
  };
  if (remainingEpisodeBars(working, question) === 0) {
    return finishAtHorizon(working, "horizon_exit", bar.time, bar);
  }
  return { state: working, asOf: bar.time, bar, event: "observed", terminal: false, result: null };
}

export function observeEpisode(
  state: EpisodeState,
  question: Question,
  _options: EpisodeEngineOptions = {},
): EpisodeAdvanceResult {
  if (state.phase !== "flat") throw new Error("observe_next_bar is only valid while flat");
  return advanceFlat(state, question, { type: "observe" });
}

export function advanceEpisode(
  state: EpisodeState,
  question: Question,
  action: EpisodeTradeAction,
  options: EpisodeEngineOptions = {},
): EpisodeAdvanceResult {
  if (state.phase === "terminal") throw new Error("episode already terminated");
  if (state.phase === "flat") {
    if (action.type !== "hold") throw new Error(`action ${action.type} is invalid while flat`);
    return advanceFlat(state, question, action);
  }
  if (state.phase === "pending" && action.type !== "hold" && action.type !== "cancel") {
    throw new Error(`action ${action.type} is invalid while the order is pending`);
  }
  if (state.phase === "open" && action.type !== "hold" && action.type !== "amend" && action.type !== "exit_next_open") {
    throw new Error(`action ${action.type} is invalid while the position is open`);
  }

  const activeTradeId = state.order?.tradeId ?? state.position?.tradeId ?? null;
  if (action.type === "cancel") {
    const cancelled = withAction(state, question, action, null, activeTradeId);
    const nextState: EpisodeState = { ...cancelled, phase: "flat", order: null };
    return {
      state: nextState,
      asOf: currentAsOf(question, state.cursor),
      bar: null,
      event: "cancelled",
      terminal: false,
      result: null,
    };
  }

  const nextCursor = state.cursor + 1;
  const bar = replayBar(question, nextCursor);
  if (!bar) throw new Error("episode has no next replay bar");
  let working: EpisodeState = {
    ...withAction(state, question, action, bar, activeTradeId),
    cursor: nextCursor,
  };

  if (working.phase === "open" && working.position && action.type === "amend") {
    working = {
      ...working,
      position: applyAmendment(working.position, action, visibleReferencePrice(question, state)),
    };
  }

  if (working.phase === "open" && working.position && action.type === "exit_next_open") {
    working = closePosition(
      working,
      "manual",
      { time: bar.time, price: numberOf(bar.open) },
      options,
    );
    if (remainingEpisodeBars(working, question) === 0) {
      return finishAtHorizon(working, "manual_exit", bar.time, bar);
    }
    return { state: working, asOf: bar.time, bar, event: "manual_exit", terminal: false, result: null };
  }

  let fillTiming: EntryFill["timing"] | null = null;
  if (working.phase === "pending" && working.order) {
    const order = { ...working.order, waitedBars: working.order.waitedBars + 1 };
    const fill = entryFill(order, visibleReferencePrice(question, state), bar);
    if (fill !== null) {
      const fillPrice = fill.price;
      const initialRisk = Math.abs(fillPrice - order.initialStop);
      if (initialRisk === 0) throw new Error("filled entry equals the initial stop");
      working = {
        ...working,
        phase: "open",
        order: null,
        position: {
          tradeId: order.tradeId,
          direction: order.direction,
          decisionBar: order.decisionBar,
          decisionTime: order.decisionTime,
          entryPrice: fillPrice,
          entryTime: bar.time,
          initialStop: order.initialStop,
          initialRisk,
          stop: order.stop,
          target: order.target,
          holdingBars: 0,
          mfeR: 0,
          maeR: 0,
        },
      };
      fillTiming = fill.timing;
    } else {
      working = { ...working, order };
      const expiry = question.replay.entryExpiryBars ?? (question.replay.basePeriod === "1h" ? 21 : 3);
      if (order.waitedBars >= expiry) {
        working = { ...working, phase: "flat", order: null };
        if (remainingEpisodeBars(working, question) === 0) {
          return finishAtHorizon(working, "no_fill", bar.time, bar);
        }
        return { state: working, asOf: bar.time, bar, event: "no_fill", terminal: false, result: null };
      }
      if (remainingEpisodeBars(working, question) === 0) {
        working = { ...working, phase: "flat", order: null };
        return finishAtHorizon(working, "no_fill", bar.time, bar);
      }
      return { state: working, asOf: bar.time, bar, event: "waiting_fill", terminal: false, result: null };
    }
  }

  if (!working.position) throw new Error("open episode is missing its position");
  if (fillTiming !== null) {
    const immediateExit = bracketCrossedAtFill(working.position);
    if (immediateExit) {
      working = closePosition(
        working,
        immediateExit,
        { time: bar.time, price: working.position.entryPrice },
        options,
      );
      const event = immediateExit === "stop" ? "stop_hit" : "target_hit";
      if (remainingEpisodeBars(working, question) === 0) {
        return finishAtHorizon(working, event, bar.time, bar);
      }
      return { state: working, asOf: bar.time, bar, event, terminal: false, result: null };
    }
  }
  const position = updateExcursions(working.position, bar);
  working = { ...working, position };
  const allowOpenGap = fillTiming !== "intrabar";

  if (stopHit(position, bar)) {
    working = closePosition(
      working,
      "stop",
      { time: bar.time, price: stopExitPrice(position, bar, allowOpenGap) },
      options,
    );
    if (remainingEpisodeBars(working, question) === 0) {
      return finishAtHorizon(working, "stop_hit", bar.time, bar);
    }
    return { state: working, asOf: bar.time, bar, event: "stop_hit", terminal: false, result: null };
  }
  if (targetHit(position, bar)) {
    working = closePosition(
      working,
      "target",
      { time: bar.time, price: targetExitPrice(position, bar, allowOpenGap) },
      options,
    );
    if (remainingEpisodeBars(working, question) === 0) {
      return finishAtHorizon(working, "target_hit", bar.time, bar);
    }
    return { state: working, asOf: bar.time, bar, event: "target_hit", terminal: false, result: null };
  }

  if (remainingEpisodeBars(working, question) === 0) {
    working = closePosition(
      working,
      "horizon",
      { time: bar.time, price: numberOf(bar.close) },
      options,
    );
    return finishAtHorizon(working, "horizon_exit", bar.time, bar);
  }

  return {
    state: working,
    asOf: bar.time,
    bar,
    event: fillTiming !== null ? "filled" : "holding",
    terminal: false,
    result: null,
  };
}
