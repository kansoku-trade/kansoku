import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EpisodeClosedTrade, EpisodeTradeResult } from '../../src/schema/episode.js';
import { engineScenarios, type EngineScenarioRun } from './engineScenarios.js';

interface BaselineEntry extends EngineScenarioRun {
  name: string;
}

const baseline: BaselineEntry[] = JSON.parse(
  readFileSync(new URL('fixtures/engine-baseline.json', import.meta.url), 'utf8'),
);

// The single lot the pre-sizing engine implied: one full-size entry, one full-size exit. Everything
// else in the record must come back untouched, so this is the only difference the AI path may show.
function withImpliedSingleLot(trade: EpisodeClosedTrade): EpisodeClosedTrade {
  return {
    ...trade,
    lots: [{ time: trade.entry.time, price: trade.entry.price, size: 1 }],
    exits: [{ time: trade.exit.time, price: trade.exit.price, size: 1, reason: trade.exitReason }],
  };
}

function expectedResult(result: EpisodeTradeResult | null): EpisodeTradeResult | null {
  if (!result) return result;
  if (!result.trades) return result;
  return { ...result, trades: result.trades.map(withImpliedSingleLot) };
}

describe('AI path identity', () => {
  it('covers the baseline scenarios captured before position sizing landed', () => {
    expect(baseline.map((entry) => entry.name)).toEqual(
      engineScenarios.map((scenario) => scenario.name),
    );
    expect(baseline.length).toBe(17);
  });

  it.each(engineScenarios.map((scenario, index) => [scenario.name, index] as const))(
    'reproduces %s value for value',
    (_name, index) => {
      const recorded = baseline[index];
      const run = engineScenarios[index].run();

      expect(run.events).toEqual(recorded.events);
      expect(run.netR).toBe(recorded.netR);
      expect(run.result).toStrictEqual(expectedResult(recorded.result));
    },
  );

  it('reduces to the pre-sizing formulas whenever one full-size lot closes in one go', () => {
    for (const [index, recorded] of baseline.entries()) {
      const trades = engineScenarios[index].run().result?.trades ?? [];
      for (const [tradeIndex, trade] of trades.entries()) {
        const before = recorded.result!.trades![tradeIndex];
        const move =
          trade.direction === 'long'
            ? before.exit.price - before.entry.price
            : before.entry.price - before.exit.price;
        expect(trade.lots).toHaveLength(1);
        expect(trade.exits).toHaveLength(1);
        expect(trade.initialRisk).toBe(Math.abs(before.entry.price - before.initialStop));
        expect(trade.grossR).toBe(move / before.initialRisk);
        expect(trade.netR).toBe(before.grossR - before.frictionR);
      }
    }
  });
});
