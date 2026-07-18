import type { ChartDoc } from "@kansoku/shared/types";
import { classifySession } from "./session.js";

export const PREDICTION_STALE_MS = 15 * 60_000;

export function predictionStale(doc: ChartDoc, now: Date): boolean {
  if (doc.type !== "intraday") return false;
  if (classifySession(Math.floor(now.getTime() / 1000)) !== "regular") return false;

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
