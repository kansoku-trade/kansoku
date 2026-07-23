import type { ChartDoc, SepaBuilt } from '@kansoku/shared/types';
import { classifySession, marketDate, marketSessionDate } from '../marketdata/session.js';
import { marketOf } from '../symbols/symbol.utils.js';

export const PREDICTION_STALE_MS = 15 * 60_000;

export function predictionStale(doc: ChartDoc, now: Date): boolean {
  if (doc.type !== 'intraday') return false;
  if (classifySession(Math.floor(now.getTime() / 1000)) !== 'regular') return false;

  const predictionCondition = (() => {
    const prediction = doc.input.prediction;
    if (prediction === null || prediction === undefined) return false;
    if (!doc.prediction_updated_at) return false;
    const updatedAt = new Date(doc.prediction_updated_at).getTime();
    return now.getTime() - updatedAt > PREDICTION_STALE_MS;
  })();

  const contextCondition = (() => {
    const context = doc.input.context as { generated_at?: string } | null | undefined;
    if (!context || !context.generated_at) return false;
    const generatedAt = new Date(context.generated_at).getTime();
    return now.getTime() - generatedAt > PREDICTION_STALE_MS;
  })();

  return predictionCondition || contextCondition;
}

function shiftIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function mostRecentTradingDate(symbol: string, now: Date): string {
  const today = marketDate(marketOf(symbol), now);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  if (weekday === 0) return shiftIsoDate(today, -2);
  if (weekday === 6) return shiftIsoDate(today, -1);
  return today;
}

export function sepaStale(doc: ChartDoc, now: Date): boolean {
  if (doc.type !== 'sepa') return false;
  const symbol = doc.symbol;
  if (!symbol) return false;
  const asOf = (doc.built as SepaBuilt).sidebar?.asOf;
  if (!asOf) return false;
  const lastBarDate = marketSessionDate(symbol, asOf);
  return lastBarDate < mostRecentTradingDate(symbol, now);
}
