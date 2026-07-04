import { describe, expect, it } from "vitest";
import type { RawBar, TimeframeKey } from "../../shared/types.js";
import { buildIntraday, coerceIntradayTimeframe, computeIntradayEntryPlan, type IntradayInput } from "../src/services/intraday.js";
import { approxDiff, loadFixture } from "./helpers.js";

type TfExpected = Record<
  TimeframeKey,
  {
    candles: unknown;
    volumes: unknown;
    macdDif: unknown;
    macdDea: unknown;
    macdHist: unknown;
    macdCrosses: unknown;
    autoDivergence: unknown;
    autoBeichi: unknown;
    last_close: number;
    summary: unknown;
  }
>;

describe("intraday parity vs python golden fixture", () => {
  const input = loadFixture<IntradayInput>("intraday-input.json");
  const expected = loadFixture<TfExpected>("intraday-expected.json");

  for (const key of ["m5", "m15", "h1"] as TimeframeKey[]) {
    it(`timeframe ${key} matches`, () => {
      const tf = coerceIntradayTimeframe(input.timeframes[key] as RawBar[], key);
      const exp = expected[key];
      expect(approxDiff(tf.candles, exp.candles)).toBeNull();
      expect(approxDiff(tf.volumes, exp.volumes)).toBeNull();
      expect(approxDiff(tf.macdDif, exp.macdDif)).toBeNull();
      expect(approxDiff(tf.macdDea, exp.macdDea)).toBeNull();
      expect(approxDiff(tf.macdHist, exp.macdHist)).toBeNull();
      expect(approxDiff(tf.macdCrosses, exp.macdCrosses)).toBeNull();
      expect(approxDiff(tf.autoDivergence, exp.autoDivergence)).toBeNull();
      expect(approxDiff(tf.autoBeichi, exp.autoBeichi)).toBeNull();
      expect(approxDiff(tf.lastClose, exp.last_close)).toBeNull();
      expect(approxDiff(tf.summary, exp.summary)).toBeNull();
    });
  }

  it("full build works in preview mode", () => {
    const { built, meta } = buildIntraday(input);
    expect(meta.mode).toBe("preview");
    expect(built.defaultTf).toBe("m15");
    expect(Object.keys(built.timeframes).sort()).toEqual(["h1", "m15", "m5"]);
    expect(built.sidebar.position?.shares).toBe(1);
  });

  it("keeps explicit target prices and level context in prediction mode", () => {
    const plan = computeIntradayEntryPlan(
      {
        entry: 61.1,
        stop: 62.52,
        target1: 60,
        target2: 57.92,
        rationale: "反弹到压力带后受阻才入场。",
        stop_note: "站回上一段反弹高点则计划失效。",
        entry_zone: { kind: "resistance", label: "反弹压力带", low: 60.9, high: 61.35 },
        target1_zone: { kind: "support", label: "日内低点", low: 60, high: 60 },
        target1_note: "整数位和日内低点。",
        target2_zone: { kind: "support", label: "深一档支撑", low: 57.9, high: 58 },
        target2_condition: "60 跌破后才成立。",
      },
      "short",
      [
        { kind: "invalidation", label: "空头失效区", low: 62.52, high: 62.52 },
        { kind: "resistance", label: "上方阻力区", low: 62.8, high: 63.2, source: "前高密集区" },
      ],
    );

    expect(plan.target1).toBe(60);
    expect(plan.target2).toBe(57.92);
    expect(plan.target1_pct).toBeCloseTo(1.8003, 4);
    expect(plan.entry_zone?.label).toBe("反弹压力带");
    expect(plan.target_contexts[0].note).toBe("整数位和日内低点。");
    expect(plan.target_contexts[1].condition).toBe("60 跌破后才成立。");
    expect(plan.price_zones.map((z) => z.label)).toEqual(["上方阻力区"]);
    expect(plan.price_zones[0].sources).toEqual(["前高密集区"]);
  });

  it("carries a valid context through to sidebar.context", () => {
    const context = {
      generated_at: "2026-07-05T14:00:00.000Z",
      conclusion: { stance: "long" as const, summary: "多头结构未破坏", action: "回踩不破前低可加仓" },
      news: [
        {
          time: "2026-07-05T13:00:00.000Z",
          source: "longbridge" as const,
          tag: "catalyst" as const,
          title: "订单超预期",
          note: "利好持续性待验证",
        },
      ],
      sources_used: ["longbridge-news"],
    };
    const { built } = buildIntraday({ ...input, context });
    expect(built.sidebar.context).toEqual(context);
  });

  it("defaults sidebar.context to null when input.context is absent", () => {
    const { built } = buildIntraday(input);
    expect(built.sidebar.context).toBeNull();
  });

  it("throws ClientError on a missing generated_at", () => {
    const context = {
      generated_at: "",
      conclusion: { stance: "long" as const, summary: "x", action: "y" },
      news: [],
      sources_used: [],
    };
    expect(() => buildIntraday({ ...input, context })).toThrow(/generated_at/);
  });

  it("throws ClientError on an invalid stance", () => {
    const context = {
      generated_at: "2026-07-05T14:00:00.000Z",
      conclusion: { stance: "sideways" as unknown as "long", summary: "x", action: "y" },
      news: [],
      sources_used: [],
    };
    expect(() => buildIntraday({ ...input, context })).toThrow(/stance/);
  });

  it("throws ClientError when news is not an array", () => {
    const context = {
      generated_at: "2026-07-05T14:00:00.000Z",
      conclusion: { stance: "long" as const, summary: "x", action: "y" },
      news: "nope" as unknown as [],
      sources_used: [],
    };
    expect(() => buildIntraday({ ...input, context })).toThrow(/news/);
  });

  it("tags every marker and connector with its origin group", () => {
    const prediction = {
      direction: "long" as const,
      anchor: { timeframe: "m15" as const, time: "2026-06-01T14:30:00.000Z", price: 100 },
      signals: [
        {
          type: "macd_divergence",
          timeframe: "m15" as const,
          bias: "bullish" as const,
          label: "底背离",
          points: [
            { time: "2026-06-01T14:00:00.000Z", price: 98, macd_value: -0.2 },
            { time: "2026-06-01T14:15:00.000Z", price: 97, macd_value: -0.1 },
          ],
        },
        {
          type: "pin_bar",
          timeframe: "m15" as const,
          time: "2026-06-01T14:30:00.000Z",
          price: 100,
          bias: "bullish" as const,
          label: "Pin Bar",
        },
      ],
      entry_plan: { entry: 100, stop: 95 },
    };
    const { built } = buildIntraday({ ...input, prediction });

    const groupsSeen = new Set<string | undefined>();
    for (const key of ["m5", "m15", "h1"] as TimeframeKey[]) {
      const tf = built.timeframes[key];
      for (const m of tf.markers) {
        expect(m.group).toBeDefined();
        groupsSeen.add(m.group);
      }
      for (const c of [...tf.priceConnectors, ...tf.macdConnectors]) {
        expect(c.group).toBeDefined();
        groupsSeen.add(c.group);
      }
      for (const m of tf.macdCrossMarkers) {
        expect(m.group).toBeUndefined();
      }
    }
    expect(groupsSeen).toEqual(new Set(["ai", "divergence", "beichi", "pattern123", "candle"]));
  });

  it("throws ClientError when sources_used is not an array", () => {
    const context = {
      generated_at: "2026-07-05T14:00:00.000Z",
      conclusion: { stance: "long" as const, summary: "x", action: "y" },
      news: [],
      sources_used: "nope" as unknown as [],
    };
    expect(() => buildIntraday({ ...input, context })).toThrow(/sources_used/);
  });
});
