import { Value } from 'typebox/value';
import type { RawBar } from '@kansoku/shared/types';
import { buildDayIndicators, buildWeekIndicators } from '../generate/indicatorsFixture.js';
import { questionSchema, type Question } from '../schema/question.js';
import { marketCloseIso, marketDate } from './generate.js';
import { periodBucketKey, periodBucketStart, type EpisodeViewPeriod } from './periods.js';
import {
  questionBaseBars,
  questionBarsForPeriod,
  questionLadder,
  questionRollupsForPeriod,
} from './questionLadder.js';

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

const ET_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const ET_OFFSET_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  timeZoneName: 'longOffset',
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
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  const sourceMarketDate = `${part('year')}-${part('month')}-${part('day')}`;
  const targetMarketDate = shiftDate(sourceMarketDate, dayShift);
  const targetNoonUtc = new Date(`${targetMarketDate}T12:00:00Z`);
  const zone = ET_OFFSET_FORMATTER.formatToParts(targetNoonUtc).find(
    (entry) => entry.type === 'timeZoneName',
  )?.value;
  const offset = zone?.replace('GMT', '') ?? '-05:00';
  const milliseconds = String(source.getUTCMilliseconds()).padStart(3, '0');
  return new Date(
    `${targetMarketDate}T${part('hour')}:${part('minute')}:${part('second')}.${milliseconds}${offset}`,
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

function aggregateBucket(time: string, bars: RawBar[]): RawBar {
  return {
    time,
    open: numberOf(bars[0].open),
    high: Math.max(...bars.map((bar) => numberOf(bar.high))),
    low: Math.min(...bars.map((bar) => numberOf(bar.low))),
    close: numberOf(bars.at(-1)!.close),
    volume: bars.reduce((sum, bar) => sum + numberOf(bar.volume), 0),
  };
}

function foldByDay(bars: RawBar[]): RawBar[] {
  const groups = new Map<string, RawBar[]>();
  for (const bar of bars) {
    const key = periodBucketKey('day', bar.time);
    const group = groups.get(key);
    if (group) group.push(bar);
    else groups.set(key, [bar]);
  }
  return [...groups.values()]
    .map((group) => aggregateBucket(periodBucketStart('day', group[0].time), group))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

export function anonymizeEpisodeQuestion(
  source: Question,
  transform: BlindCaseTransform,
): { question: Question; provenance: BlindCaseProvenance } {
  if (!/^ASSET\d{3}$/.test(transform.alias))
    throw new Error(`invalid blind alias: ${transform.alias}`);
  const sourceCutoffDate = marketDate(source.cutoff);
  const sourceDateMs = Date.parse(`${sourceCutoffDate}T00:00:00Z`);
  const syntheticDateMs = Date.parse(`${transform.syntheticCutoff}T00:00:00Z`);
  if (Number.isNaN(syntheticDateMs))
    throw new Error(`invalid synthetic cutoff: ${transform.syntheticCutoff}`);
  const dayShift = Math.round((syntheticDateMs - sourceDateMs) / 86_400_000);
  if (dayShift % 7 !== 0) {
    throw new Error(
      `blind cutoff shift must preserve weekdays: ${sourceCutoffDate}/${transform.syntheticCutoff}`,
    );
  }

  const syntheticCutoff = marketCloseIso(transform.syntheticCutoff);
  const [basePeriod, midPeriod, topPeriod] = questionLadder(source);

  const baseBarsSource = questionBaseBars(source);
  const cutoffBase = baseBarsSource.at(-1);
  if (!cutoffBase)
    throw new Error(`blind source question has no base-tier cutoff bar: ${source.id}`);
  const cutoffClose = numberOf(cutoffBase.close);
  if (cutoffClose <= 0) throw new Error(`blind source cutoff close must be positive: ${source.id}`);
  const baseVolumes = baseBarsSource
    .map((bar) => numberOf(bar.volume))
    .filter((value) => value > 0);
  if (baseVolumes.length === 0)
    throw new Error(`blind source has no positive base-tier volume: ${source.id}`);
  const priceScale = 100 / cutoffClose;
  const volumeScale = 1_000_000 / median(baseVolumes);

  const transformBars = (bars: RawBar[]): RawBar[] =>
    bars.map((bar) => transformBar(bar, dayShift, priceScale, volumeScale));

  const baseBars = transformBars(baseBarsSource);
  const midBars = transformBars(questionBarsForPeriod(source, midPeriod));
  const topBars = transformBars(questionBarsForPeriod(source, topPeriod));

  const lastMidBar = midBars.at(-1);
  if (topPeriod !== 'day' && lastMidBar) {
    const cutoffTopKey = periodBucketKey(topPeriod, lastMidBar.time);
    const currentTopBucketMidBars = midBars.filter(
      (bar) => periodBucketKey(topPeriod, bar.time) === cutoffTopKey,
    );
    const currentTopIndex = topBars.findIndex(
      (bar) => periodBucketKey(topPeriod, bar.time) === cutoffTopKey,
    );
    if (currentTopIndex >= 0) {
      topBars[currentTopIndex] = aggregateBucket(
        periodBucketStart(topPeriod, lastMidBar.time),
        currentTopBucketMidBars,
      );
    }
  }

  const replayBars = transformBars(source.replay.bars);

  const tierBarsByPeriod: Partial<Record<EpisodeViewPeriod, RawBar[]>> = {
    [basePeriod]: baseBars,
    [midPeriod]: midBars,
    [topPeriod]: topBars,
  };
  const hasDayTier = Boolean(tierBarsByPeriod.day?.length);
  const quoteDays = hasDayTier ? tierBarsByPeriod.day! : foldByDay(baseBars);
  // Relies on generate.ts's requiredBaseBars() having given `source` at least two
  // sessions of base bars whenever the ladder has no day tier; this is a backstop
  // for any caller that hands anonymizeEpisodeQuestion a question built another way.
  if (!hasDayTier && quoteDays.length < 2) {
    throw new Error(
      `insufficient ${basePeriod} history for a stable blind quote: need 2 trading days, got ${quoteDays.length} (source ${source.id})`,
    );
  }
  const transformedCutoffDay = quoteDays.at(-1)!;
  const previousDay = quoteDays.at(-2);
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
    layer: 'anonymous',
    adversarial: source.adversarial,
    fixtures: {
      kline: {
        ...(baseBars.length ? { [basePeriod]: baseBars } : {}),
        [midPeriod]: midBars,
        [topPeriod]: topBars,
      },
      indicators: {
        [midPeriod]: buildDayIndicators(midBars),
        [topPeriod]: buildWeekIndicators(topBars),
      },
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
            [midPeriod]: questionRollupsForPeriod(source, midPeriod).map((item) => ({
              availableAt: shiftTime(item.availableAt, dayShift),
              bar: transformBar(item.bar, dayShift, priceScale, volumeScale),
            })),
            [topPeriod]: questionRollupsForPeriod(source, topPeriod).map((item) => ({
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
      `invalid anonymized episode question: ${first?.instancePath ?? '(root)'} ${first?.message ?? 'schema mismatch'}`,
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
