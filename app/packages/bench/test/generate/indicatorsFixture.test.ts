import { describe, expect, it } from "vitest";
import { buildDayIndicators, buildWeekIndicators } from "../../src/generate/indicatorsFixture.js";

function bar(time: string, close: number) {
  return { time, open: `${close}`, high: `${close}`, low: `${close}`, close: `${close}`, volume: "1000000" };
}

function series(length: number, start = 100): ReturnType<typeof bar>[] {
  const out = [];
  for (let i = 0; i < length; i++) out.push(bar(`bar-${i}`, start + Math.sin(i / 5) * 10 + i * 0.1));
  return out;
}

describe("buildDayIndicators", () => {
  it("produces latest sma20/50/200 and a 60-point macd tail", () => {
    const bars = series(250);
    const result = buildDayIndicators(bars);
    expect(typeof result.sma20).toBe("number");
    expect(typeof result.sma50).toBe("number");
    expect(typeof result.sma200).toBe("number");
    expect(result.macd.dif.length).toBe(60);
    expect(result.macd.dea.length).toBe(60);
    expect(result.macd.hist.length).toBe(60);
    expect(result.macd.dif[result.macd.dif.length - 1]).not.toBeNull();
  });

  it("returns null smas when there aren't enough bars for that window", () => {
    const bars = series(30);
    const result = buildDayIndicators(bars);
    expect(result.sma200).toBeNull();
    expect(typeof result.sma20).toBe("number");
  });
});

describe("buildWeekIndicators", () => {
  it("produces latest sma10/30", () => {
    const bars = series(104);
    const result = buildWeekIndicators(bars);
    expect(typeof result.sma10).toBe("number");
    expect(typeof result.sma30).toBe("number");
  });
});
