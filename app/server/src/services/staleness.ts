import type { ChartDoc } from "../../../shared/types.js";
import { classifySession } from "./session.js";

export const PREDICTION_STALE_MS = 15 * 60_000;

export function predictionStale(doc: ChartDoc, now: Date): boolean {
  if (doc.type !== "intraday") return false;
  const prediction = doc.input.prediction;
  if (prediction === null || prediction === undefined) return false;
  if (!doc.prediction_updated_at) return false;
  if (classifySession(Math.floor(now.getTime() / 1000)) !== "regular") return false;
  const updatedAt = new Date(doc.prediction_updated_at).getTime();
  return now.getTime() - updatedAt > PREDICTION_STALE_MS;
}
