import type { ChartDoc } from "../../../shared/types.js";
import { ClientError } from "../errors.js";
import { buildChart, refreshBody } from "../services/build.js";
import { predictionStale } from "../services/staleness.js";
import { loadChart } from "../services/store.js";
import { createPoller, type PollerHandle } from "./poller.js";

const CHART_INTERVAL_MS = 60_000;
const LIVE_TYPES = new Set(["flow", "intraday"]);

const chartPollers = new Map<string, PollerHandle>();

function predictionFields(doc: ChartDoc) {
  return { prediction_updated_at: doc.prediction_updated_at, prediction_stale: predictionStale(doc, new Date()) };
}

export async function subscribeChart(id: string, push: (envelope: string) => void, count?: number): Promise<() => void> {
  const doc = await loadChart(id);
  if (!doc) throw new ClientError(`chart not found: ${id}`, undefined, 404);

  const viewCount = count !== undefined && doc.type === "intraday" ? count : undefined;
  if (viewCount === undefined) {
    push(JSON.stringify({ type: "data", data: { built: doc.built, ...predictionFields(doc) } }));
  }

  if (!LIVE_TYPES.has(doc.type) || !refreshBody(doc.type, doc.input)) return () => {};

  const key = viewCount === undefined ? id : `${id}#${viewCount}`;
  let handle = chartPollers.get(key);
  if (!handle) {
    handle = createPoller({
      intervalMs: CHART_INTERVAL_MS,
      task: async () => {
        const latest = await loadChart(id);
        if (!latest) throw new ClientError(`chart not found: ${id}`, undefined, 404);
        const body = refreshBody(latest.type, latest.input);
        const built = body
          ? (await buildChart(viewCount === undefined ? body : { ...body, count: viewCount })).built
          : latest.built;
        return { built, ...predictionFields(latest) };
      },
      onStop: () => {
        chartPollers.delete(key);
      },
    });
    chartPollers.set(key, handle);
  }
  return handle.subscribe(push);
}
