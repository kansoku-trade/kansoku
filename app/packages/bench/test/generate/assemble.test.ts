import { describe, expect, it } from "vitest";
import { Value } from "typebox/value";
import { assembleQuestion, type QuoteBar } from "../../src/generate/assemble.js";
import { questionSchema } from "../../src/schema/question.js";

function dayBar(dateIndex: number, close: number, volume = 1_000_000): QuoteBar {
  const date = new Date(Date.UTC(2026, 0, 1));
  date.setUTCDate(date.getUTCDate() + dateIndex);
  const iso = date.toISOString().slice(0, 10);
  return {
    time: `${iso}T05:00:00Z`,
    open: `${close}`,
    high: `${close + 1}`,
    low: `${close - 1}`,
    close: `${close}`,
    volume: `${volume}`,
    turnover: `${volume * close}`,
  };
}

function weekBar(weekIndex: number, close: number): QuoteBar {
  const date = new Date(Date.UTC(2020, 0, 6));
  date.setUTCDate(date.getUTCDate() + weekIndex * 7);
  const iso = date.toISOString().slice(0, 10);
  return {
    time: `${iso}T05:00:00Z`,
    open: `${close}`,
    high: `${close + 1}`,
    low: `${close - 1}`,
    close: `${close}`,
    volume: "1000000",
  };
}

function buildDayBars(count: number): QuoteBar[] {
  return Array.from({ length: count }, (_, i) => dayBar(i, 100 + Math.sin(i / 6) * 5 + i * 0.05));
}

function buildWeekBars(count: number): QuoteBar[] {
  return Array.from({ length: count }, (_, i) => weekBar(i, 100 + Math.sin(i / 4) * 5 + i * 0.1));
}

describe("assembleQuestion", () => {
  it("produces an id in the swing-<SYMBOL>-<date>-<seq> format", () => {
    const dayBars = buildDayBars(280);
    const weekBars = buildWeekBars(150);
    const cutoffIndex = 260;
    const question = assembleQuestion({
      symbol: "MU.US",
      layer: "high-vol-tech",
      dayBars,
      weekBars,
      cutoffIndex,
      seq: 1,
      requiredBeforeDay: 250,
      requiredBeforeWeek: 104,
      horizonBars: 20,
      calendar: {},
    });
    const cutoffDate = dayBars[cutoffIndex].time.slice(0, 10);
    expect(question.id).toBe(`swing-MU-${cutoffDate}-01`);
  });

  it("slices exactly the required bar counts and shapes the indicator block", () => {
    const dayBars = buildDayBars(300);
    const weekBars = buildWeekBars(150);
    const question = assembleQuestion({
      symbol: "NVDA.US",
      layer: "high-vol-tech",
      dayBars,
      weekBars,
      cutoffIndex: 260,
      seq: 2,
      requiredBeforeDay: 250,
      requiredBeforeWeek: 104,
      horizonBars: 20,
      calendar: { nextEarnings: "2026-06-25" },
    });

    expect(question.fixtures.kline.day).toHaveLength(250);
    expect(question.fixtures.kline.week.length).toBeLessThanOrEqual(104);
    expect(question.fixtures.kline.week.length).toBeGreaterThan(0);
    expect(question.replay.bars).toHaveLength(20);

    const indicators = question.fixtures.indicators as {
      day: { sma20: number | null; sma50: number | null; sma200: number | null; macd: { dif: unknown[] } };
      week: { sma10: number | null; sma30: number | null };
    };
    expect(typeof indicators.day.sma20).toBe("number");
    expect(typeof indicators.day.sma200).toBe("number");
    expect(indicators.day.macd.dif.length).toBeLessThanOrEqual(60);
    expect(typeof indicators.week.sma10).toBe("number");

    expect(question.fixtures.capitalFlow).toEqual({});
    expect(question.fixtures.news).toEqual([]);
    expect(question.fixtures.fundamentals).toEqual({});
    expect(question.fixtures.calendar).toEqual({ nextEarnings: "2026-06-25" });
  });

  it("round-trips through the Task 2 question schema validator", () => {
    const dayBars = buildDayBars(280);
    const weekBars = buildWeekBars(150);
    const question = assembleQuestion({
      symbol: "MU.US",
      layer: "high-vol-tech",
      dayBars,
      weekBars,
      cutoffIndex: 260,
      seq: 1,
      requiredBeforeDay: 250,
      requiredBeforeWeek: 104,
      horizonBars: 20,
      calendar: {},
    });
    expect(Value.Check(questionSchema, question)).toBe(true);
  });
});
