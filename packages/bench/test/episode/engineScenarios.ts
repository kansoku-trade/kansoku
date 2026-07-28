import {
  advanceEpisode,
  createEpisodeState,
  episodeNetR,
  observeEpisode,
  submitEpisode,
  type EpisodeEngineOptions,
  type EpisodeEntryMode,
  type EpisodeEvent,
  type EpisodeState,
} from '../../src/episode/engine.js';
import type { EpisodeTradeAction, EpisodeTradeResult } from '../../src/schema/episode.js';
import type { Question } from '../../src/schema/question.js';
import type { Submission } from '../../src/schema/submission.js';

export interface EngineScenarioRun {
  events: EpisodeEvent[];
  netR: number;
  result: EpisodeTradeResult | null;
}

export interface EngineScenario {
  name: string;
  run: () => EngineScenarioRun;
}

function bar(time: string, open: number, high: number, low: number, close: number) {
  return { time, open, high, low, close, volume: 1_000 };
}

function question(bars: ReturnType<typeof bar>[], basePeriod: '1h' | '5m' = '1h'): Question {
  return {
    id: `swing-BASELINE-${basePeriod}`,
    bank: 'swing',
    symbol: 'MU.US',
    cutoff: '2026-03-20T20:00:00-04:00',
    layer: 'high-vol-tech',
    adversarial: false,
    fixtures: {
      kline: { day: [bar('2026-03-20', 98, 102, 97, 100)], week: [] },
      indicators: {},
      quote: { last: 100 },
      capitalFlow: {},
      news: [],
      fundamentals: {},
      calendar: {},
    },
    replay: { basePeriod, entryExpiryBars: 3, horizonBars: bars.length, bars },
  };
}

function prediction(
  direction: 'long' | 'short',
  entry: number,
  stop: number,
  target: number,
): Submission {
  return {
    direction,
    anchor: { timeframe: 'h1', time: '2026-03-20T20:00:00-04:00', price: entry },
    entry_plan: { entry, stop, target1: target },
    scenarios: [
      { label: '主情景', probability: 60 },
      { label: '反向情景', probability: 40 },
    ],
    decision_reason: { category: 'breakout', summary: '价格突破关键结构，按计划入场。' },
    comment: '基线场景',
  };
}

function neutral(): Submission {
  return {
    direction: 'neutral',
    anchor: { timeframe: 'h1', time: '2026-03-20T20:00:00-04:00', price: 100 },
    scenarios: [
      { label: '区间', probability: 60 },
      { label: '突破', probability: 40 },
    ],
    decision_reason: { category: 'no_setup', summary: '当前没有满足风险收益要求的机会。' },
    comment: '继续观察',
  };
}

function reasoned<T extends Record<string, unknown>>(action: T): EpisodeTradeAction {
  return {
    ...action,
    reason: { category: 'risk_management', summary: '结构尚未失效，继续按既定风险计划执行。' },
  } as EpisodeTradeAction;
}

class ScenarioDriver {
  private state: EpisodeState = createEpisodeState();
  private readonly events: EpisodeEvent[] = [];

  constructor(
    private readonly question: Question,
    private readonly options: EpisodeEngineOptions = {},
  ) {}

  get terminal(): boolean {
    return this.state.phase === 'terminal';
  }

  submit(submission: Submission, entryMode: EpisodeEntryMode = 'limit'): this {
    const step = submitEpisode(this.state, this.question, submission, this.options, entryMode);
    this.state = step.state;
    this.events.push(step.event);
    return this;
  }

  act(action: EpisodeTradeAction): this {
    const step = advanceEpisode(this.state, this.question, action, this.options);
    this.state = step.state;
    this.events.push(step.event);
    return this;
  }

  observe(): this {
    const step = observeEpisode(this.state, this.question, this.options);
    this.state = step.state;
    this.events.push(step.event);
    return this;
  }

  drain(): this {
    while (!this.terminal) {
      if (this.state.phase === 'flat') this.observe();
      else this.act(reasoned({ type: 'hold' }));
    }
    return this;
  }

  finish(): EngineScenarioRun {
    this.drain();
    return { events: this.events, netR: episodeNetR(this.state), result: this.state.result };
  }
}

const defaultBars = [
  bar('2026-03-23T14:30:00Z', 100, 106, 99, 105),
  bar('2026-03-23T15:30:00Z', 105, 106, 99, 100),
  bar('2026-03-23T16:30:00Z', 100, 103, 98, 102),
];

export const engineScenarios: EngineScenario[] = [
  {
    name: 'two-round-trips-to-horizon',
    run: () => {
      const q = question(defaultBars);
      return new ScenarioDriver(q)
        .submit(prediction('long', 100, 95, 104))
        .act(reasoned({ type: 'hold' }))
        .submit(prediction('short', 105, 110, 101))
        .act(reasoned({ type: 'hold' }))
        .finish();
    },
  },
  {
    name: 'stop-entry-does-not-stop-out-on-its-own-bar',
    run: () => {
      const q = question([
        bar('2026-03-23T14:30:00Z', 99, 104, 96, 103.5),
        bar('2026-03-23T15:30:00Z', 103.5, 105, 103, 104),
      ]);
      return new ScenarioDriver(q).submit(prediction('long', 103, 97, 110)).finish();
    },
  },
  {
    name: 'limit-entry-does-not-take-profit-on-its-own-bar',
    run: () => {
      const q = question([
        bar('2026-03-23T14:30:00Z', 99.5, 105, 97.5, 98.5),
        bar('2026-03-23T15:30:00Z', 98.5, 99, 98, 98.5),
      ]);
      return new ScenarioDriver(q).submit(prediction('long', 98, 95, 104)).finish();
    },
  },
  {
    name: 'observe-then-delayed-short-target',
    run: () => {
      const q = question(defaultBars);
      return new ScenarioDriver(q)
        .observe()
        .submit(prediction('short', 105, 110, 101))
        .act(reasoned({ type: 'hold' }))
        .finish();
    },
  },
  {
    name: 'stop-then-reenter',
    run: () => {
      const q = question([
        bar('2026-03-23T14:30:00Z', 100, 101, 94, 95),
        bar('2026-03-23T15:30:00Z', 95, 100, 94, 99),
        bar('2026-03-23T16:30:00Z', 99, 104, 98, 103),
      ]);
      return new ScenarioDriver(q)
        .submit(prediction('long', 100, 95, 120))
        .act(reasoned({ type: 'hold' }))
        .submit(prediction('long', 96, 92, 104))
        .finish();
    },
  },
  {
    name: 'amended-stop-applies-to-the-next-bar',
    run: () => {
      const q = question([
        bar('2026-03-23T14:30:00Z', 100, 103, 99, 102),
        bar('2026-03-23T15:30:00Z', 102, 104, 100, 101),
        bar('2026-03-23T16:30:00Z', 101, 103, 100, 102),
      ]);
      return new ScenarioDriver(q)
        .submit(prediction('long', 100, 95, 110))
        .act(reasoned({ type: 'hold' }))
        .act(reasoned({ type: 'amend', stop: 101 }))
        .finish();
    },
  },
  {
    name: 'amend-target-then-manual-exit',
    run: () => {
      const q = question([
        bar('2026-03-23T14:30:00Z', 100, 102, 99, 101),
        bar('2026-03-23T15:30:00Z', 101, 103, 100, 102),
        bar('2026-03-23T16:30:00Z', 102, 104, 101, 103),
        bar('2026-03-23T17:30:00Z', 103, 105, 102, 104),
      ]);
      return new ScenarioDriver(q)
        .submit(prediction('long', 100, 95, 120))
        .act(reasoned({ type: 'hold' }))
        .act(reasoned({ type: 'amend', stop: 97, target: 118 }))
        .act(reasoned({ type: 'exit_next_open' }))
        .finish();
    },
  },
  {
    name: 'expired-order-then-cancel',
    run: () => {
      const q = question([
        bar('2026-03-23T14:30:00Z', 100, 102, 99, 101),
        bar('2026-03-23T15:30:00Z', 101, 103, 100, 102),
        bar('2026-03-23T16:30:00Z', 102, 104, 101, 103),
        bar('2026-03-23T17:30:00Z', 103, 105, 102, 104),
      ]);
      const driver = new ScenarioDriver(q)
        .submit(prediction('long', 90, 85, 100))
        .act(reasoned({ type: 'hold' }))
        .act(reasoned({ type: 'hold' }))
        .act(reasoned({ type: 'hold' }));
      return driver
        .submit(prediction('long', 90, 85, 100))
        .act(reasoned({ type: 'cancel' }))
        .finish();
    },
  },
  {
    name: 'same-bar-stop-resolves-before-target',
    run: () => {
      const q = question([bar('2026-03-23T14:30:00Z', 100, 110, 90, 100)]);
      return new ScenarioDriver(q).submit(prediction('long', 100, 95, 106)).finish();
    },
  },
  {
    name: 'intrabar-entry-prices-its-stop-at-the-stop',
    run: () => {
      const q = question([bar('2026-02-06T14:30:00Z', 98.147166, 100.917579, 97.989683, 98.4)]);
      return new ScenarioDriver(q).submit(prediction('long', 100.1, 98.6, 101.8)).finish();
    },
  },
  {
    name: 'gap-fill-already-past-its-bracket',
    run: () => {
      const q = question([bar('2026-03-23T14:30:00Z', 85, 89, 80, 82)]);
      return new ScenarioDriver(q).submit(prediction('short', 95, 105, 90)).finish();
    },
  },
  {
    name: 'horizon-forced-exit',
    run: () => {
      const q = question([bar('2026-03-23T14:30:00Z', 100, 103, 99, 102)]);
      return new ScenarioDriver(q).submit(prediction('long', 100, 95, 120)).finish();
    },
  },
  {
    name: 'neutral-abstain',
    run: () => {
      const q = question(defaultBars);
      return new ScenarioDriver(q).submit(neutral()).finish();
    },
  },
  {
    name: 'batch-advance-across-a-stop',
    run: () => {
      const q = question(
        [
          bar('2026-03-23T13:30:00Z', 100, 101, 99, 100.3),
          bar('2026-03-23T13:35:00Z', 100.3, 101, 100, 100.5),
          bar('2026-03-23T13:40:00Z', 100.5, 101, 94, 95),
          bar('2026-03-23T13:45:00Z', 95, 96, 93, 94),
          bar('2026-03-23T13:50:00Z', 94, 95, 92, 93),
          bar('2026-03-23T13:55:00Z', 93, 94, 91, 92),
          bar('2026-03-23T14:00:00Z', 92, 93, 90, 91),
          bar('2026-03-23T14:05:00Z', 91, 92, 89, 90),
          bar('2026-03-23T14:10:00Z', 90, 91, 88, 89),
        ],
        '5m',
      );
      return new ScenarioDriver(q)
        .submit(prediction('long', 100, 97, 110))
        .act(reasoned({ type: 'hold' }))
        .act(reasoned({ type: 'hold', bars: 5, period: '15m' }))
        .finish();
    },
  },
  {
    name: 'market-entry-fills-at-the-next-open',
    run: () => {
      const q = question([
        bar('2026-03-23T14:30:00Z', 100, 103, 98, 101),
        bar('2026-03-23T15:30:00Z', 101, 104, 99, 102),
      ]);
      return new ScenarioDriver(q).submit(prediction('long', 95, 90, 108), 'market').finish();
    },
  },
  {
    name: 'costed-target-hit-at-25bps',
    run: () => {
      const q = question(defaultBars);
      return new ScenarioDriver(q, { costBps: 25 })
        .submit(prediction('long', 100, 95, 104))
        .act(reasoned({ type: 'hold' }))
        .finish();
    },
  },
  {
    name: 'costed-short-stop-at-25bps',
    run: () => {
      const q = question([
        bar('2026-03-23T14:30:00Z', 100, 112, 99, 111),
        bar('2026-03-23T15:30:00Z', 111, 113, 110, 112),
      ]);
      return new ScenarioDriver(q, { costBps: 25 })
        .submit(prediction('short', 100, 110, 90))
        .finish();
    },
  },
];
