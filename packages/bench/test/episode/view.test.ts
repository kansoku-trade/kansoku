import { describe, expect, it } from "vitest";
import { advanceEpisode, createEpisodeState, submitEpisode } from "../../src/episode/engine.js";
import { buildEpisodeQuestionView } from "../../src/episode/view.js";
import type { EpisodeTradeAction } from "../../src/schema/episode.js";
import type { Question } from "../../src/schema/question.js";
import type { Submission } from "../../src/schema/submission.js";

function bar(time: string, open: number, high: number, low: number, close: number, volume = 100) {
  return { time, open, high, low, close, volume };
}

const QUESTION: Question = {
  id: "swing-MULTI-01",
  bank: "swing",
  symbol: "MU.US",
  cutoff: "2026-03-20T20:00:00-04:00",
  layer: "high-vol-tech",
  adversarial: false,
  fixtures: {
    kline: {
      "1h": [bar("2026-03-20T19:30:00Z", 98, 101, 97, 100)],
      day: [
        bar("2026-03-19", 95, 99, 94, 98, 1_000),
        bar("2026-03-20", 98, 102, 97, 100, 1_100),
      ],
      week: [bar("2026-03-16", 94, 102, 93, 100, 5_000)],
    },
    indicators: {},
    quote: { last: 100 },
    capitalFlow: {},
    news: [],
    fundamentals: {},
    calendar: {},
  },
  replay: {
    basePeriod: "1h",
    entryExpiryBars: 21,
    horizonBars: 3,
    bars: [
      bar("2026-03-23T13:30:00Z", 100, 103, 99, 102, 200),
      bar("2026-03-23T14:30:00Z", 102, 105, 101, 104, 300),
      bar("2026-03-24T13:30:00Z", 104, 106, 103, 105, 400),
    ],
    rollups: {
      day: [
        {
          availableAt: "2026-03-23T14:30:00Z",
          bar: bar("2026-03-23", 99.5, 105.5, 98.5, 104.1, 550),
        },
        {
          availableAt: "2026-03-24T13:30:00Z",
          bar: bar("2026-03-24", 103.8, 106.2, 102.8, 105.2, 450),
        },
      ],
      week: [],
    },
  },
};

const SUBMISSION: Submission = {
  direction: "long",
  anchor: { timeframe: "h1", time: QUESTION.cutoff, price: 100 },
  entry_plan: { entry: 100, stop: 90, target1: 120 },
  scenarios: [
    { label: "上涨", probability: 60 },
    { label: "回撤", probability: 40 },
  ],
  decision_reason: { category: "trend_following", summary: "多周期趋势保持向上。" },
  comment: "多周期视图测试",
};

const HOLD: EpisodeTradeAction = {
  type: "hold",
  reason: { category: "risk_management", summary: "趋势未失效，继续持有。" },
};

describe("episode rolling multi-timeframe view", () => {
  it("reveals one hourly bar and builds a partial day/week without exposing later bars", () => {
    const submitted = submitEpisode(createEpisodeState(), QUESTION, SUBMISSION);
    const first = advanceEpisode(submitted.state, QUESTION, HOLD);
    const view = buildEpisodeQuestionView(QUESTION, first.state);

    expect(view.fixtures.kline["1h"].map((entry) => entry.time)).toEqual([
      "2026-03-20T19:30:00Z",
      "2026-03-23T13:30:00Z",
    ]);
    expect(view.fixtures.kline["1h"]).not.toContainEqual(QUESTION.replay.bars[1]);
    expect(view.fixtures.kline.day.at(-1)).toMatchObject({ time: "2026-03-23", open: 100, close: 102, volume: 200 });
    expect(view.fixtures.kline.week.at(-1)).toMatchObject({ time: "2026-03-23", close: 102 });
    expect(view.fixtures.quote).toMatchObject({ last: 102, prev_close: 100 });
    expect(view.cutoff).toBe("2026-03-23T13:30:00Z");
  });

  it("updates the same day candle, then starts a new day while retaining all revealed hours", () => {
    let state = submitEpisode(createEpisodeState(), QUESTION, SUBMISSION).state;
    state = advanceEpisode(state, QUESTION, HOLD).state;
    state = advanceEpisode(state, QUESTION, HOLD).state;
    let view = buildEpisodeQuestionView(QUESTION, state);
    expect(view.fixtures.kline.day.at(-1)).toMatchObject({
      time: "2026-03-23",
      open: 99.5,
      high: 105.5,
      low: 98.5,
      close: 104.1,
      volume: 550,
    });
    expect(view.fixtures.quote).toMatchObject({ last: 104.1, open: 99.5, high: 105.5, low: 98.5, volume: 550 });

    state = advanceEpisode(state, QUESTION, HOLD).state;
    view = buildEpisodeQuestionView(QUESTION, state);
    expect(view.fixtures.kline["1h"]).toHaveLength(4);
    expect(view.fixtures.kline.day.slice(-2).map((entry) => entry.time)).toEqual(["2026-03-23", "2026-03-24"]);
    expect(view.fixtures.kline.day.at(-1)).toMatchObject({ time: "2026-03-24", close: 105.2, volume: 450 });
    expect(view.fixtures.kline.week.at(-1)).toMatchObject({ time: "2026-03-23", close: 105.2 });
    expect(view.fixtures.indicators).toHaveProperty("day");
    expect(view.fixtures.indicators).toHaveProperty("week");
  });
});
