import type { AnalysisOutcome, RawBar } from "../../../../shared/types.js";

function toSec(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

export function judgeOutcome(
  direction: "long" | "short" | "neutral",
  anchor: { time: string; price: number },
  plan: { stop?: number; target1?: number } | null,
  bars: RawBar[],
): AnalysisOutcome | null {
  if (direction === "neutral" || !plan || plan.stop === undefined || plan.target1 === undefined) return null;

  const { stop, target1 } = plan;
  const anchorSec = toSec(anchor.time);

  if (bars.length > 0) {
    const firstSec = toSec(bars[0].time);
    if (firstSec > anchorSec) {
      const tolerance = bars.length > 1 ? Math.max(0, toSec(bars[1].time) - firstSec) : Infinity;
      if (firstSec - anchorSec > tolerance) return null;
    }
  }

  const following = bars.filter((bar) => toSec(bar.time) > anchorSec);

  if (following.length === 0) {
    return { status: "open", pct_since_anchor: 0, resolved_at: null };
  }

  for (const bar of following) {
    const high = Number(bar.high);
    const low = Number(bar.low);
    const hitStop = direction === "long" ? low <= stop : high >= stop;
    const hitTarget = direction === "long" ? high >= target1 : low <= target1;
    // Same-bar collision: when both stop and target trigger inside one bar, the
    // stop is assumed to have been touched first (conservative).
    if (hitStop) {
      return {
        status: "hit_stop",
        pct_since_anchor: (Number(following[following.length - 1].close) / anchor.price - 1) * 100,
        resolved_at: toSec(bar.time),
      };
    }
    if (hitTarget) {
      return {
        status: "hit_target",
        pct_since_anchor: (Number(following[following.length - 1].close) / anchor.price - 1) * 100,
        resolved_at: toSec(bar.time),
      };
    }
  }

  const lastClose = Number(following[following.length - 1].close);
  return { status: "open", pct_since_anchor: (lastClose / anchor.price - 1) * 100, resolved_at: null };
}
