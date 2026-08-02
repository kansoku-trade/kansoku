import { describe, expect, it } from 'vitest';
import { macd, toTs } from '@kansoku/core/analysis/indicators';
import type { TrainerClosedTrade, TrainerPosition, TrainerView } from '@kansoku/pro-api';
import type { RawBar } from '@kansoku/shared/types';
import {
  buildTrainerIntradayBuilt,
  TRAINER_PERIOD_TO_CHART_TF,
  trainerAdvancePeriod,
} from './payloadToIntradayBuilt';
import { tfDataOf } from '../charts/intraday/timeframes';

function bar(iso: string, close: number): RawBar {
  return {
    time: iso,
    open: close - 1,
    high: close + 1,
    low: close - 1.5,
    close,
    volume: 1000 + close,
  };
}

function downBar(iso: string, close: number): RawBar {
  return {
    time: iso,
    open: close + 1,
    high: close + 1.5,
    low: close - 1,
    close,
    volume: 1000 + close,
  };
}

const BASE_BARS: RawBar[] = [
  bar('2026-01-05T14:00:00.000Z', 100),
  bar('2026-01-05T14:05:00.000Z', 101),
  bar('2026-01-05T14:10:00.000Z', 102),
  bar('2026-01-05T14:15:00.000Z', 103),
  bar('2026-01-05T14:20:00.000Z', 104),
];

// Deliberately clock-shifted far past BASE_BARS and value-shifted into a
// disjoint range, so if the mid/top tiers ever got wired into the base slot
// (or vice versa) the boundary assertions below would fail loudly instead of
// silently passing.
const MID_BARS: RawBar[] = [
  bar('2026-01-05T20:00:00.000Z', 9001),
  bar('2026-01-05T21:00:00.000Z', 9002),
];

const TOP_BARS: RawBar[] = [
  bar('2026-01-06T14:00:00.000Z', 9101),
  bar('2026-01-07T14:00:00.000Z', 9102),
];

function makeView(overrides?: Partial<TrainerView>): TrainerView {
  return {
    caseId: 'case-1',
    symbol: 'TRAIN01',
    basePeriod: '5m',
    ladder: ['5m', '15m', '1h'],
    cursor: BASE_BARS.length - 1,
    asOf: BASE_BARS.at(-1)!.time,
    bars: { base: BASE_BARS, mid: MID_BARS, top: TOP_BARS },
    quote: {},
    phase: 'flat',
    order: null,
    position: null,
    trades: [],
    netR: 0,
    remainingBars: 10,
    terminal: false,
    result: null,
    ...overrides,
  };
}

describe('buildTrainerIntradayBuilt', () => {
  it('ends the base-timeframe candle array exactly at the cursor bar with no later timestamp', () => {
    const view = makeView();
    const built = buildTrainerIntradayBuilt(view);
    const tf = TRAINER_PERIOD_TO_CHART_TF[view.basePeriod];
    const candles = tfDataOf(built, tf)?.candles ?? [];
    const cursorTs = toTs(BASE_BARS[view.cursor].time);

    expect(candles).toHaveLength(BASE_BARS.length);
    expect(candles.map((c) => c.time)).toEqual(BASE_BARS.map((b) => toTs(b.time)));
    expect(candles.at(-1)?.time).toBe(cursorTs);
    for (const c of candles) {
      expect(c.time).toBeLessThanOrEqual(cursorTs);
    }
  });

  it('keeps each ladder tier mapped to its own bars, not a neighboring tier', () => {
    const view = makeView();
    const built = buildTrainerIntradayBuilt(view);

    const midTf = TRAINER_PERIOD_TO_CHART_TF['15m'];
    const topTf = TRAINER_PERIOD_TO_CHART_TF['1h'];
    const midCandles = tfDataOf(built, midTf)?.candles ?? [];
    const topCandles = tfDataOf(built, topTf)?.candles ?? [];

    expect(midCandles.map((c) => c.time)).toEqual(MID_BARS.map((b) => toTs(b.time)));
    expect(topCandles.map((c) => c.time)).toEqual(TOP_BARS.map((b) => toTs(b.time)));
  });

  it('does not fabricate volumes or candles beyond what the payload carried', () => {
    const view = makeView();
    const built = buildTrainerIntradayBuilt(view);
    const tf = TRAINER_PERIOD_TO_CHART_TF[view.basePeriod];
    const data = tfDataOf(built, tf);

    expect(data?.volumes).toHaveLength(BASE_BARS.length);
    expect(data?.volumes.map((v) => v.value)).toEqual(BASE_BARS.map((b) => Number(b.volume)));
  });

  it('colours volume bars by candle direction, as the main intraday chart does', () => {
    const mixed: RawBar[] = [
      bar('2026-01-05T14:00:00.000Z', 100),
      downBar('2026-01-05T14:05:00.000Z', 99),
      bar('2026-01-05T14:10:00.000Z', 101),
      downBar('2026-01-05T14:15:00.000Z', 98),
    ];
    const view = makeView({
      bars: { base: mixed, mid: MID_BARS, top: TOP_BARS },
      cursor: mixed.length - 1,
      asOf: mixed.at(-1)!.time,
    });
    const built = buildTrainerIntradayBuilt(view);
    const volumes = tfDataOf(built, TRAINER_PERIOD_TO_CHART_TF['5m'])?.volumes ?? [];

    expect(volumes.map((v) => v.color)).toEqual(['#26a69a', '#ef5350', '#26a69a', '#ef5350']);
  });

  it('flags a volume spike above 1.5x the 20-bar average with the surge colour', () => {
    const flat: RawBar[] = Array.from({ length: 25 }, (_, i) => ({
      ...bar(new Date(Date.UTC(2026, 0, 5, 14, i * 5)).toISOString(), 100 + i),
      volume: 1000,
    }));
    flat[flat.length - 1] = { ...flat[flat.length - 1], volume: 3000 };
    const view = makeView({
      bars: { base: flat, mid: MID_BARS, top: TOP_BARS },
      cursor: flat.length - 1,
      asOf: flat.at(-1)!.time,
    });
    const built = buildTrainerIntradayBuilt(view);
    const volumes = tfDataOf(built, TRAINER_PERIOD_TO_CHART_TF['5m'])?.volumes ?? [];

    expect(volumes.at(-1)?.color).toBe('#ff5722');
    expect(volumes.at(-2)?.color).toBe('#26a69a');
  });
});

describe('buildTrainerIntradayBuilt epilogue', () => {
  const EPILOGUE_BARS: RawBar[] = [
    bar('2026-01-05T14:25:00.000Z', 105),
    bar('2026-01-05T14:30:00.000Z', 106),
  ];

  // Unlike the disjoint MID_BARS / TOP_BARS above, these are the real 15m and 1h roll-ups of
  // BASE_BARS: the case stopped inside the 14:15Z quarter-hour and inside the 13:30Z hour, so both
  // tiers end on a bucket the epilogue continues rather than replaces.
  const ROLLED_MID: RawBar[] = [
    { time: '2026-01-05T14:00:00Z', open: 99, high: 103, low: 98.5, close: 102, volume: 3303 },
    { time: '2026-01-05T14:15:00Z', open: 102, high: 105, low: 101.5, close: 104, volume: 2207 },
  ];
  const ROLLED_TOP: RawBar[] = [
    { time: '2026-01-05T13:30:00Z', open: 99, high: 105, low: 98.5, close: 104, volume: 5510 },
  ];
  const rolledView = () =>
    makeView({ bars: { base: BASE_BARS, mid: ROLLED_MID, top: ROLLED_TOP } });

  it('extends the base tier, appended after the last case bar', () => {
    const view = makeView();
    const built = buildTrainerIntradayBuilt(view, EPILOGUE_BARS);
    const baseTf = TRAINER_PERIOD_TO_CHART_TF[view.basePeriod];
    const candles = tfDataOf(built, baseTf)?.candles ?? [];

    expect(candles).toHaveLength(BASE_BARS.length + EPILOGUE_BARS.length);
    expect(candles.map((c) => c.time)).toEqual(
      [...BASE_BARS, ...EPILOGUE_BARS].map((b) => toTs(b.time)),
    );
  });

  it('rolls the epilogue into the mid tier instead of leaving it flat', () => {
    const built = buildTrainerIntradayBuilt(rolledView(), EPILOGUE_BARS);
    const candles = tfDataOf(built, TRAINER_PERIOD_TO_CHART_TF['15m'])?.candles ?? [];

    expect(candles).toEqual([
      { time: toTs('2026-01-05T14:00:00Z'), open: 99, high: 103, low: 98.5, close: 102 },
      { time: toTs('2026-01-05T14:15:00Z'), open: 102, high: 106, low: 101.5, close: 105 },
      { time: toTs('2026-01-05T14:30:00Z'), open: 105, high: 107, low: 104.5, close: 106 },
    ]);
  });

  it('rolls the epilogue into the top tier on its own wider buckets', () => {
    const built = buildTrainerIntradayBuilt(rolledView(), EPILOGUE_BARS);
    const candles = tfDataOf(built, TRAINER_PERIOD_TO_CHART_TF['1h'])?.candles ?? [];

    expect(candles).toEqual([
      { time: toTs('2026-01-05T13:30:00Z'), open: 99, high: 106, low: 98.5, close: 105 },
      { time: toTs('2026-01-05T14:30:00Z'), open: 105, high: 107, low: 104.5, close: 106 },
    ]);
  });

  it('carries the epilogue volume onto the upper tiers too', () => {
    const built = buildTrainerIntradayBuilt(rolledView(), EPILOGUE_BARS);
    const volumes = tfDataOf(built, TRAINER_PERIOD_TO_CHART_TF['15m'])?.volumes ?? [];

    expect(volumes.map((v) => v.value)).toEqual([3303, 3312, 1106]);
  });

  it('is a no-op on every tier when the epilogue is omitted, null, or empty', () => {
    const view = rolledView();
    const tiers = (built: ReturnType<typeof buildTrainerIntradayBuilt>) =>
      (['m5', 'm15', 'h1'] as const).map((tf) => tfDataOf(built, tf)?.candles);
    const expected = tiers(buildTrainerIntradayBuilt(view));

    expect(expected[0]).toHaveLength(BASE_BARS.length);
    expect(expected[1]).toHaveLength(ROLLED_MID.length);
    expect(expected[2]).toHaveLength(ROLLED_TOP.length);
    expect(tiers(buildTrainerIntradayBuilt(view, null))).toEqual(expected);
    expect(tiers(buildTrainerIntradayBuilt(view, []))).toEqual(expected);
  });
});

describe('buildTrainerIntradayBuilt MACD', () => {
  function seriesBars(n: number): RawBar[] {
    const start = Date.parse('2026-01-05T14:00:00.000Z');
    return Array.from({ length: n }, (_, i) =>
      bar(new Date(start + i * 5 * 60_000).toISOString(), 100 + Math.sin(i / 5) * 3 + i * 0.1),
    );
  }

  it('leaves the MACD series empty when the tier has too few bars to warm up', () => {
    const view = makeView();
    const built = buildTrainerIntradayBuilt(view);
    const tf = TRAINER_PERIOD_TO_CHART_TF[view.basePeriod];
    const data = tfDataOf(built, tf);

    expect(data?.macdDif).toEqual([]);
    expect(data?.macdDea).toEqual([]);
    expect(data?.macdHist).toEqual([]);
  });

  it("computes dif/dea/hist with @kansoku/core's macd() once the tier has enough bars", () => {
    const bars = seriesBars(80);
    const view = makeView({ bars: { base: bars, mid: MID_BARS, top: TOP_BARS } });
    const built = buildTrainerIntradayBuilt(view);
    const tf = TRAINER_PERIOD_TO_CHART_TF[view.basePeriod];
    const data = tfDataOf(built, tf);

    const expected = macd(bars.map((b) => Number(b.close)));
    const expectedDifCount = expected.dif.filter((v) => v !== null).length;
    const expectedHistCount = expected.hist.filter((v) => v !== null).length;

    expect(expectedDifCount).toBeGreaterThan(0);
    expect(data?.macdDif).toHaveLength(expectedDifCount);
    expect(data?.macdHist).toHaveLength(expectedHistCount);
    expect(data?.macdDif.at(-1)?.value).toBe(expected.dif.at(-1));
    expect(data?.macdHist.every((p) => p.color === '#26a69a' || p.color === '#ef5350')).toBe(true);
  });
});

describe('trainerAdvancePeriod', () => {
  const LADDER: TrainerView['ladder'] = ['5m', '15m', '1h'];

  it('maps the active chart timeframe back to its ladder period', () => {
    expect(trainerAdvancePeriod(LADDER, 'm5')).toBe('5m');
    expect(trainerAdvancePeriod(LADDER, 'm15')).toBe('15m');
    expect(trainerAdvancePeriod(LADDER, 'h1')).toBe('1h');
  });

  it('falls back to the base period for a timeframe outside the ladder', () => {
    expect(trainerAdvancePeriod(LADDER, 'day')).toBe('5m');
  });
});

function closedTrade(overrides: Partial<TrainerClosedTrade> = {}): TrainerClosedTrade {
  return {
    tradeId: 1,
    direction: 'long',
    decisionBar: 0,
    decisionTime: BASE_BARS[0].time,
    entry: { time: '2026-01-05T14:05:00.000Z', price: 101 },
    exit: { time: '2026-01-05T14:15:00.000Z', price: 103 },
    exitReason: 'target',
    initialStop: 99,
    finalStop: 99,
    target: 106,
    initialRisk: 2,
    grossR: 1,
    frictionR: 0,
    netR: 1,
    mfeR: 1.2,
    maeR: 0.1,
    holdingBars: 2,
    ...overrides,
  };
}

const SCALED_TRADE = closedTrade({
  entry: { time: '2026-01-05T14:05:00.000Z', price: 99 },
  exit: { time: '2026-01-05T14:20:00.000Z', price: 104 },
  lots: [
    { time: '2026-01-05T14:05:00.000Z', price: 101, size: 0.5 },
    { time: '2026-01-05T14:10:00.000Z', price: 97, size: 0.5 },
  ],
  exits: [
    { time: '2026-01-05T14:15:00.000Z', price: 106, size: 0.5, reason: 'target' },
    { time: '2026-01-05T14:20:00.000Z', price: 102, size: 0.5, reason: 'stop' },
  ],
  exitReason: 'stop',
});

function baseMarkers(trades: TrainerClosedTrade[]) {
  const view = makeView({ trades, terminal: true, phase: 'terminal' });
  const built = buildTrainerIntradayBuilt(view);
  return tfDataOf(built, TRAINER_PERIOD_TO_CHART_TF['5m'])!.markers;
}

function openPosition(overrides: Partial<TrainerPosition> = {}): TrainerPosition {
  return {
    tradeId: 2,
    direction: 'long',
    decisionBar: 0,
    decisionTime: '2026-01-05T14:00:00.000Z',
    lots: [{ time: '2026-01-05T14:05:00.000Z', price: 101, size: 0.5, remaining: 0.5 }],
    exits: [],
    entryPrice: 101,
    entryTime: '2026-01-05T14:05:00.000Z',
    initialStop: 99,
    riskUnit: 2,
    realizedR: 0,
    realizedFrictionR: 0,
    stop: 99,
    target: 105,
    holdingBars: 2,
    mfeR: 0,
    maeR: 0,
    entryReason: { category: 'breakout', summary: '' },
    ...overrides,
  };
}

function liveMarkers(view: TrainerView) {
  return tfDataOf(buildTrainerIntradayBuilt(view), TRAINER_PERIOD_TO_CHART_TF['5m'])!.markers;
}

describe('buildTrainerIntradayBuilt trade marks', () => {
  // Previously nothing was marked before the episode ended. These are the trader's own fills on
  // bars that are already revealed, so withholding them hid where they got in — the one thing they
  // need on the chart while deciding what to do next.
  it('marks the open position mid-episode', () => {
    const markers = liveMarkers(makeView({ phase: 'open', position: openPosition() }));
    expect(markers).toHaveLength(1);
    expect(markers[0].id).toBe('open-2-entry-0');
    expect(markers[0].time).toBe(toTs('2026-01-05T14:05:00.000Z'));
    expect(markers[0].text).toBe('B');
    expect(markers[0].shape).toBe('arrowUp');
  });

  it('marks each add and each partial close of the open position', () => {
    const markers = liveMarkers(
      makeView({
        phase: 'open',
        position: openPosition({
          lots: [
            { time: '2026-01-05T14:05:00.000Z', price: 101, size: 0.25, remaining: 0.25 },
            { time: '2026-01-05T14:10:00.000Z', price: 102, size: 0.25, remaining: 0.25 },
          ],
          exits: [{ time: '2026-01-05T14:15:00.000Z', price: 104, size: 0.25, reason: 'manual' }],
        }),
      }),
    );
    expect(markers.map((m) => m.id)).toEqual(['open-2-entry-0', 'open-2-entry-1', 'open-2-exit-0']);
    expect(markers[1].tooltip).toContain('加仓 $102.00 · 25%');
    // The add sits on the bar right after the first entry and on the same side of it, so thinLabels
    // drops its letter to stop the two from overprinting; the arrow and tooltip still carry it. The
    // partial close stacks above the bar instead, so it keeps its own.
    expect(markers[1].text).toBe('');
    expect(markers[2].text).toBe('C');
  });

  it('marks trades already closed earlier in the same episode', () => {
    const markers = liveMarkers(makeView({ trades: [closedTrade()] }));
    expect(markers.map((m) => m.id)).toEqual(['trade-1-entry-0', 'trade-1-exit-0']);
  });

  // The guardrail the old "mark nothing" rule was really protecting: a mark may never sit on a bar
  // the trader has not been shown, or it would leak post-cursor price action.
  it('never places a mark past the last revealed bar', () => {
    const lastRevealed = toTs(BASE_BARS.at(-1)!.time);
    const markers = liveMarkers(
      makeView({ phase: 'open', position: openPosition(), trades: [closedTrade()] }),
    );
    expect(markers).not.toHaveLength(0);
    for (const marker of markers) expect(marker.time as number).toBeLessThanOrEqual(lastRevealed);
  });

  it('leaves the open position to the closed-trade marks once the episode ends', () => {
    const view = makeView({
      terminal: true,
      phase: 'terminal',
      position: openPosition(),
      trades: [closedTrade()],
    });
    expect(liveMarkers(view).map((m) => m.id)).toEqual(['trade-1-entry-0', 'trade-1-exit-0']);
  });

  it('emits an entry mark and an exit mark, each on its own bar', () => {
    const markers = baseMarkers([closedTrade()]);
    expect(markers).toHaveLength(2);
    expect(markers[0].id).toBe('trade-1-entry-0');
    expect(markers[0].time).toBe(toTs('2026-01-05T14:05:00.000Z'));
    expect(markers[0].text).toBe('B');
    expect(markers[1].id).toBe('trade-1-exit-0');
    expect(markers[1].time).toBe(toTs('2026-01-05T14:15:00.000Z'));
    expect(markers[1].text).toBe('T');
  });

  // The trade-level entry/exit are size-weighted averages — 99.00 and 104.00 here — and neither was
  // ever traded. Marking them would also hide the add and the partial take-profit entirely.
  it('marks every lot and every exit of a scaled trade at its own bar and price', () => {
    const markers = baseMarkers([SCALED_TRADE]);
    expect(markers.map((marker) => marker.id)).toEqual([
      'trade-1-entry-0',
      'trade-1-entry-1',
      'trade-1-exit-0',
      'trade-1-exit-1',
    ]);
    expect(markers.map((marker) => marker.time)).toEqual([
      toTs('2026-01-05T14:05:00.000Z'),
      toTs('2026-01-05T14:10:00.000Z'),
      toTs('2026-01-05T14:15:00.000Z'),
      toTs('2026-01-05T14:20:00.000Z'),
    ]);
    expect(markers.map((marker) => marker.tooltip)).toEqual([
      '第 1 笔 · 多\n进场 $101.00 · 50%\n止损 $99.00 · 目标 $106.00',
      '第 1 笔 · 多\n加仓 $97.00 · 50%\n止损 $99.00 · 目标 $106.00',
      '第 1 笔 · 多\n离场 $106.00 · 50%（止盈）',
      '第 1 笔 · 多\n离场 $102.00 · 50%（止损）\n净 1.00 R · 持有 2 根',
    ]);
  });

  // Four labels over five bars is what the settlement actually looked like: they overprinted each
  // other into an unreadable smear. One label per side per trade, and the arrows keep the rest.
  // Each fill carries its own letter now that a label is one character wide: B for a buy, T for a
  // target exit, X for a stop. The two that come back blank are each one bar behind a letter on the
  // same side of the bar, which is close enough to overprint it — their arrow colour and tooltip
  // still say what they were.
  it('letters every fill of a scaled trade, thinning only what would overprint', () => {
    const markers = baseMarkers([SCALED_TRADE]);
    expect(markers.map((marker) => marker.text)).toEqual(['B', '', 'T', '']);
    expect(markers[3].tooltip).toContain('止损');
  });

  it('drops a label that would land on top of one already placed on the same side', () => {
    const markers = baseMarkers([
      closedTrade({
        entry: { time: '2026-01-05T14:00:00.000Z', price: 100 },
        exit: { time: '2026-01-05T14:05:00.000Z', price: 98 },
        exitReason: 'stop',
      }),
    ]);
    expect(markers.map((m) => m.position)).toEqual(['belowBar', 'belowBar']);
    expect(markers.map((m) => m.text)).toEqual(['B', '']);
    expect(markers[1].tooltip).toContain('离场 $98.00');
  });

  it('keeps both labels when the same two marks sit on opposite sides', () => {
    const markers = baseMarkers([
      closedTrade({
        entry: { time: '2026-01-05T14:00:00.000Z', price: 100 },
        exit: { time: '2026-01-05T14:05:00.000Z', price: 102 },
      }),
    ]);
    expect(markers.map((m) => m.position)).toEqual(['belowBar', 'aboveBar']);
    expect(markers.map((m) => m.text)).toEqual(['B', 'T']);
  });

  // A stopped-out long left at the bottom of the move; an exit mark floating above the bar reads as
  // a price level rather than as the moment the trade ended.
  it('puts the exit mark on the side the price actually went', () => {
    const stopped = baseMarkers([
      closedTrade({ exitReason: 'stop', exit: { time: '2026-01-05T14:15:00.000Z', price: 99 } }),
    ]);
    expect(stopped[0].position).toBe('belowBar');
    expect(stopped[1].position).toBe('belowBar');
    expect(stopped[1].tooltip).toContain('离场 $99.00');

    const won = baseMarkers([closedTrade()]);
    expect(won[1].position).toBe('aboveBar');
  });

  it('splits a round trip that closed at its entry price onto opposite sides', () => {
    const flat = baseMarkers([
      closedTrade({ exit: { time: '2026-01-05T14:05:00.000Z', price: 101 }, exitReason: 'stop' }),
    ]);
    expect(flat[0].position).toBe('belowBar');
    expect(flat[1].position).toBe('aboveBar');
  });

  it('snaps a mark onto the aggregated bar that contains it on the upper tiers', () => {
    const view = makeView({
      trades: [
        closedTrade({
          entry: { time: '2026-01-05T20:30:00.000Z', price: 9001 },
          exit: { time: '2026-01-05T21:45:00.000Z', price: 9002 },
        }),
      ],
      terminal: true,
      phase: 'terminal',
    });
    const built = buildTrainerIntradayBuilt(view);
    const mid = tfDataOf(built, TRAINER_PERIOD_TO_CHART_TF['15m'])!.markers;
    expect(mid.map((m) => m.time)).toEqual([
      toTs('2026-01-05T20:00:00.000Z'),
      toTs('2026-01-05T21:00:00.000Z'),
    ]);
  });
});
