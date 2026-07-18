import { describe, expect, it } from "vitest";
import type { QuoteBar } from "../../src/generate/assemble.js";
import {
  EPISODE_REQUIRED_DAY,
  EPISODE_REQUIRED_H1,
  EPISODE_REQUIRED_WEEK,
  assembleEpisodeQuestion,
  marketCloseIso,
} from "../../src/episode/generate.js";
import { Value } from "typebox/value";
import { questionSchema } from "../../src/schema/question.js";

function dateOffset(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function bar(time: string, index: number): QuoteBar {
  const close = 100 + index / 10;
  return {
    time,
    open: String(close - 0.2),
    high: String(close + 0.5),
    low: String(close - 0.5),
    close: String(close),
    volume: String(1_000_000 + index),
    turnover: String((1_000_000 + index) * close),
  };
}

function businessDates(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = dateOffset(cursor, 1)) {
    const day = new Date(`${cursor}T12:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) dates.push(cursor);
  }
  return dates;
}

function hourBarsForCutoff(cutoff: string, futureSessions: number): QuoteBar[] {
  const dates = businessDates(dateOffset(cutoff, -60), dateOffset(cutoff, 20));
  const initial = dates.filter((date) => date <= cutoff).slice(-30);
  const future = dates.filter((date) => date > cutoff).slice(0, futureSessions);
  return [...initial, ...future].flatMap((date, dateIndex) =>
    Array.from({ length: 7 }, (_, hourIndex) => {
      const hour = String(9 + hourIndex).padStart(2, "0");
      const minute = hourIndex === 0 ? "30" : "30";
      return bar(`${date}T${hour}:${minute}:00-04:00`, dateIndex * 7 + hourIndex);
    }),
  );
}

function dailyBars(cutoff: string): QuoteBar[] {
  return businessDates(dateOffset(cutoff, -500), dateOffset(cutoff, 20)).map((date, index) =>
    bar(`${date}T20:00:00Z`, index),
  );
}

function weeklyBars(cutoff: string): QuoteBar[] {
  return Array.from({ length: 120 }, (_, index) =>
    bar(`${dateOffset(cutoff, (index - 120) * 7)}T20:00:00Z`, index),
  );
}

describe("assembleEpisodeQuestion", () => {
  it("builds a schema-valid 1h/day/week case with a session-based replay horizon", () => {
    const cutoffDate = "2026-03-25";
    const days = dailyBars(cutoffDate);
    const poisonedCurrentWeek = bar("2026-03-23T20:00:00Z", 9_999);
    const question = assembleEpisodeQuestion({
      symbol: "MU.US",
      layer: "high-vol-tech",
      cutoffDate,
      hourBars: hourBarsForCutoff(cutoffDate, 4),
      dayBars: days,
      weekBars: [...weeklyBars(cutoffDate), poisonedCurrentWeek],
      horizonSessions: 4,
      calendar: {},
    });

    expect(Value.Check(questionSchema, question)).toBe(true);
    expect(question.fixtures.kline["1h"]).toHaveLength(EPISODE_REQUIRED_H1);
    expect(question.fixtures.kline.day).toHaveLength(EPISODE_REQUIRED_DAY);
    expect(question.fixtures.kline.week).toHaveLength(EPISODE_REQUIRED_WEEK);
    const cutoffDay = days.find((value) => value.time.startsWith(cutoffDate))!;
    expect(question.fixtures.kline.week.at(-1)).toMatchObject({
      time: "2026-03-23",
      close: Number(cutoffDay.close),
    });
    expect(question.replay.basePeriod).toBe("1h");
    expect(question.replay.horizonSessions).toBe(4);
    expect(question.replay.horizonBars).toBe(28);
    expect(question.replay.decisionExpiryBars).toBeUndefined();
    expect(question.replay.entryExpiryBars).toBe(21);
    expect(question.replay.bars).toHaveLength(28);
    expect(question.replay.rollups?.day).toHaveLength(4);
    expect(question.replay.rollups?.week).toHaveLength(1);
    expect(question.replay.rollups?.week[0].bar.close).toBe(poisonedCurrentWeek.close);
    expect(question.fixtures.kline["1h"].every((value) => Date.parse(value.time) < Date.parse(question.cutoff))).toBe(
      true,
    );
  });

  it("uses the correct New York close offset across daylight-saving time", () => {
    expect(marketCloseIso("2026-01-02")).toBe("2026-01-02T16:00:00-05:00");
    expect(marketCloseIso("2026-06-15")).toBe("2026-06-15T16:00:00-04:00");
  });

  it("rejects a replay that does not cover the requested number of sessions", () => {
    const cutoffDate = "2026-03-25";
    expect(() =>
      assembleEpisodeQuestion({
        symbol: "MU.US",
        layer: "high-vol-tech",
        cutoffDate,
        hourBars: hourBarsForCutoff(cutoffDate, 2),
        dayBars: dailyBars(cutoffDate),
        weekBars: weeklyBars(cutoffDate),
        horizonSessions: 4,
      }),
    ).toThrow("insufficient replay sessions");
  });
});
