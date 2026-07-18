import { Value } from "typebox/value";
import type { RawBar } from "@kansoku/shared/types";
import { buildDayIndicators, buildWeekIndicators } from "../generate/indicatorsFixture.js";
import { questionSchema, type Question } from "../schema/question.js";
import { marketCloseIso, marketDate, weekKey } from "./generate.js";

export interface BlindCaseTransform {
  alias: string;
  syntheticCutoff: string;
}

export interface BlindCaseProvenance {
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

const ET_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const ET_OFFSET_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  timeZoneName: "longOffset",
});

function numberOf(value: string | number | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`invalid numeric bar value: ${value}`);
  return parsed;
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function shiftTime(time: string, dayShift: number): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(time)) return shiftDate(time, dayShift);
  const source = new Date(time);
  if (Number.isNaN(source.getTime())) throw new Error(`invalid bar time: ${time}`);
  const parts = ET_DATE_TIME_FORMATTER.formatToParts(source);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  const sourceMarketDate = `${part("year")}-${part("month")}-${part("day")}`;
  const targetMarketDate = shiftDate(sourceMarketDate, dayShift);
  const targetNoonUtc = new Date(`${targetMarketDate}T12:00:00Z`);
  const zone = ET_OFFSET_FORMATTER.formatToParts(targetNoonUtc)
    .find((entry) => entry.type === "timeZoneName")?.value;
  const offset = zone?.replace("GMT", "") ?? "-05:00";
  const milliseconds = String(source.getUTCMilliseconds()).padStart(3, "0");
  return new Date(
    `${targetMarketDate}T${part("hour")}:${part("minute")}:${part("second")}.${milliseconds}${offset}`,
  ).toISOString();
}

function transformBar(
  bar: RawBar,
  dayShift: number,
  priceScale: number,
  volumeScale: number,
): RawBar {
  return {
    time: shiftTime(bar.time, dayShift),
    open: rounded(numberOf(bar.open) * priceScale),
    high: rounded(numberOf(bar.high) * priceScale),
    low: rounded(numberOf(bar.low) * priceScale),
    close: rounded(numberOf(bar.close) * priceScale),
    volume: rounded(numberOf(bar.volume) * volumeScale),
  };
}

function aggregateWeek(key: string, bars: RawBar[]): RawBar {
  return {
    time: key,
    open: numberOf(bars[0].open),
    high: Math.max(...bars.map((bar) => numberOf(bar.high))),
    low: Math.min(...bars.map((bar) => numberOf(bar.low))),
    close: numberOf(bars.at(-1)!.close),
    volume: bars.reduce((sum, bar) => sum + numberOf(bar.volume), 0),
  };
}

export function anonymizeEpisodeQuestion(
  source: Question,
  transform: BlindCaseTransform,
): { question: Question; provenance: BlindCaseProvenance } {
  if (!/^ASSET[0-9]{3}$/.test(transform.alias)) throw new Error(`invalid blind alias: ${transform.alias}`);
  const sourceCutoffDate = marketDate(source.cutoff);
  const sourceDateMs = Date.parse(`${sourceCutoffDate}T00:00:00Z`);
  const syntheticDateMs = Date.parse(`${transform.syntheticCutoff}T00:00:00Z`);
  if (Number.isNaN(syntheticDateMs)) throw new Error(`invalid synthetic cutoff: ${transform.syntheticCutoff}`);
  const dayShift = Math.round((syntheticDateMs - sourceDateMs) / 86_400_000);
  if (dayShift % 7 !== 0) {
    throw new Error(`blind cutoff shift must preserve weekdays: ${sourceCutoffDate}/${transform.syntheticCutoff}`);
  }

  const syntheticCutoff = marketCloseIso(transform.syntheticCutoff);
  const cutoffDay = source.fixtures.kline.day.at(-1);
  if (!cutoffDay) throw new Error(`blind source question has no daily cutoff bar: ${source.id}`);
  const cutoffClose = numberOf(cutoffDay.close);
  if (cutoffClose <= 0) throw new Error(`blind source cutoff close must be positive: ${source.id}`);
  const dailyVolumes = source.fixtures.kline.day.map((bar) => numberOf(bar.volume)).filter((value) => value > 0);
  if (dailyVolumes.length === 0) throw new Error(`blind source has no positive daily volume: ${source.id}`);
  const priceScale = 100 / cutoffClose;
  const volumeScale = 1_000_000 / median(dailyVolumes);

  const transformBars = (bars: RawBar[] | undefined): RawBar[] =>
    (bars ?? []).map((bar) => transformBar(bar, dayShift, priceScale, volumeScale));
  const day = transformBars(source.fixtures.kline.day);
  const cutoffWeek = weekKey(transform.syntheticCutoff);
  const week = transformBars(source.fixtures.kline.week);
  const currentWeekDays = day.filter((bar) => weekKey(marketDate(bar.time)) === cutoffWeek);
  const currentWeekIndex = week.findIndex((bar) => weekKey(marketDate(bar.time)) === cutoffWeek);
  if (currentWeekIndex >= 0 && currentWeekDays.length > 0) {
    week[currentWeekIndex] = aggregateWeek(cutoffWeek, currentWeekDays);
  }
  const oneHour = transformBars(source.fixtures.kline["1h"]);
  const replayBars = transformBars(source.replay.bars);
  const previousDay = day.at(-2);
  const transformedCutoffDay = day.at(-1)!;
  const sourceQuote = source.fixtures.quote as Record<string, unknown>;
  const sourceTurnover = Number(sourceQuote.turnover);
  const quote: Record<string, unknown> = {
    last: numberOf(transformedCutoffDay.close),
    open: numberOf(transformedCutoffDay.open),
    high: numberOf(transformedCutoffDay.high),
    low: numberOf(transformedCutoffDay.low),
    volume: numberOf(transformedCutoffDay.volume),
    prev_close: previousDay ? numberOf(previousDay.close) : null,
    turnover: Number.isFinite(sourceTurnover)
      ? rounded(sourceTurnover * priceScale * volumeScale)
      : null,
  };

  const aliasSymbol = `${transform.alias}.SIM`;
  const outputId = `swing-${transform.alias}-${transform.syntheticCutoff}-01`;
  const question: Question = {
    id: outputId,
    bank: source.bank,
    symbol: aliasSymbol,
    cutoff: syntheticCutoff,
    layer: "anonymous",
    adversarial: source.adversarial,
    fixtures: {
      kline: { "1h": oneHour, day, week },
      indicators: { day: buildDayIndicators(day), week: buildWeekIndicators(week) },
      quote,
      capitalFlow: {},
      news: [],
      fundamentals: {},
      calendar: {},
    },
    replay: {
      ...source.replay,
      bars: replayBars,
      rollups: source.replay.rollups
        ? {
            day: source.replay.rollups.day.map((item) => ({
              availableAt: shiftTime(item.availableAt, dayShift),
              bar: transformBar(item.bar, dayShift, priceScale, volumeScale),
            })),
            week: source.replay.rollups.week.map((item) => ({
              availableAt: shiftTime(item.availableAt, dayShift),
              bar: transformBar(item.bar, dayShift, priceScale, volumeScale),
            })),
          }
        : undefined,
    },
  };

  if (!Value.Check(questionSchema, question)) {
    const first = Value.Errors(questionSchema, question)[0];
    throw new Error(
      `invalid anonymized episode question: ${first?.instancePath ?? "(root)"} ${first?.message ?? "schema mismatch"}`,
    );
  }

  return {
    question,
    provenance: {
      outputId,
      aliasSymbol,
      sourceId: source.id,
      sourceSymbol: source.symbol,
      sourceCutoff: source.cutoff,
      syntheticCutoff,
      dayShift,
      priceScale,
      volumeScale,
    },
  };
}
