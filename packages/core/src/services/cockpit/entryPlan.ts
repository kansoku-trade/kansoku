import type { ChartDoc } from "@kansoku/shared/types";
import { listCharts, loadChart } from "../store.js";

export interface EntryPlan {
  stop?: number;
  target1?: number;
  target2?: number;
}

export async function latestIntradayDoc(symbol: string): Promise<ChartDoc | null> {
  const metas = await listCharts({ symbol, type: "intraday", limit: 1 });
  if (!metas.length) return null;
  return loadChart(metas[0].id);
}

export function entryPlanFromDoc(doc: ChartDoc | null): EntryPlan | null {
  if (doc && doc.built.kind === "intraday" && doc.built.entryPlan) {
    const { stop, target1, target2 } = doc.built.entryPlan;
    return { stop, target1, target2 };
  }
  return null;
}
