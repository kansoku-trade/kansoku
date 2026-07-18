import type { SupportZone, VolumeProfile } from "@kansoku/shared/types";
import { pyRound } from "./indicators.js";

const ZONE_PALETTE: Record<string, { label_zh: string; fill: string; border: string; axis_color: string; hint: string }> = {
  warning: {
    label_zh: "诱多区",
    fill: "rgba(239, 83, 80, 0.16)",
    border: "#ef5350",
    axis_color: "#ef5350",
    hint: "刚 climax top 后的第一次回调，主力借反弹派发——不能买",
  },
  watch: {
    label_zh: "关注区",
    fill: "rgba(255, 193, 7, 0.16)",
    border: "#ffc107",
    axis_color: "#ffc107",
    hint: "需触及当天缩量 + ≥1 根反转 K + 大盘配合，确认后小试",
  },
  buy: {
    label_zh: "第一买点",
    fill: "rgba(38, 166, 154, 0.20)",
    border: "#26a69a",
    axis_color: "#26a69a",
    hint: "VDU 后放量反弹是合格信号，可分批进场",
  },
  value: {
    label_zh: "价值区",
    fill: "rgba(0, 137, 123, 0.32)",
    border: "#00897b",
    axis_color: "#26a69a",
    hint: "成交密集区 + 长期均线交汇，机构成本带，逆向布局重点",
  },
};

export function normalizeSupportZones(rawZones: Partial<SupportZone>[] | null | undefined): SupportZone[] {
  if (!rawZones || !rawZones.length) return [];
  const out: SupportZone[] = [];
  for (const z of rawZones) {
    let low = Number(z.low);
    let high = Number(z.high);
    if (!Number.isFinite(low) || !Number.isFinite(high)) continue;
    if (high < low) [low, high] = [high, low];
    const tier = z.tier || "watch";
    const palette = ZONE_PALETTE[tier] ?? ZONE_PALETTE.watch;
    out.push({
      low,
      high,
      tier,
      label: z.label || palette.label_zh,
      fill: z.fill || palette.fill,
      border: z.border || palette.border,
      axis_color: palette.axis_color,
      note: z.note || palette.hint,
      sources: z.sources || [],
    });
  }
  out.sort((a, b) => b.low - a.low);
  return out;
}

export function computeVolumeProfile(
  highs: number[],
  lows: number[],
  vols: number[],
  lookback = 120,
  nBins = 30,
): VolumeProfile {
  const seg = Math.min(lookback, highs.length);
  const hs = highs.slice(-seg);
  const ls = lows.slice(-seg);
  const vs = vols.slice(-seg);
  const lo = Math.min(...ls);
  const hi = Math.max(...hs);
  if (hi <= lo) return { bins: [], max_weight: 0, lookback: seg };
  const span = hi - lo;
  const binsArr = new Array<number>(nBins).fill(0);
  const width = span / nBins;
  for (let i = 0; i < seg; i++) {
    let bLo = Math.trunc((ls[i] - lo) / width);
    let bHi = Math.trunc((hs[i] - lo) / width);
    bLo = Math.max(0, Math.min(nBins - 1, bLo));
    bHi = Math.max(0, Math.min(nBins - 1, bHi));
    const n = bHi - bLo + 1;
    const per = vs[i] / n;
    for (let b = bLo; b <= bHi; b++) binsArr[b] += per;
  }
  const maxW = Math.max(...binsArr) || 1;
  const bins = binsArr.map((w, i) => ({
    low: pyRound(lo + i * width, 4),
    high: pyRound(lo + (i + 1) * width, 4),
    weight: pyRound(w, 2),
    pct: pyRound(w / maxW, 4),
  }));
  return { bins, max_weight: pyRound(maxW, 2), lookback: seg };
}

export function defaultSupportZones(
  closes: number[],
  ma50: number,
  ma150: number,
  ma200: number,
  vp: VolumeProfile,
): SupportZone[] {
  const zones: Partial<SupportZone>[] = [];
  const last = closes[closes.length - 1];
  if (ma50 && ma50 < last) {
    zones.push({
      low: pyRound(ma50 * 0.98, 2),
      high: pyRound(ma50 * 1.02, 2),
      tier: "watch",
      label: "MA50 关注区",
      sources: [`MA50 $${ma50.toFixed(2)}`],
    });
  }
  if (ma200 && ma200 < last) {
    zones.push({
      low: pyRound(Math.min(ma200, ma150 || ma200) * 0.97, 2),
      high: pyRound(Math.max(ma200, ma150 || ma200) * 1.03, 2),
      tier: "value",
      label: "长期均线价值区",
      sources: [`MA150 $${ma150.toFixed(2)}`, `MA200 $${ma200.toFixed(2)}`],
    });
  }
  const below = vp.bins.filter((b) => b.high < last);
  if (below.length) {
    const top = below.reduce((a, b) => (b.weight > a.weight ? b : a), below[0]);
    const idx = below.indexOf(top);
    let lo = top.low;
    let hi = top.high;
    const thresh = top.weight * 0.6;
    for (let j = idx - 1; j >= 0; j--) {
      if (below[j].weight >= thresh) lo = below[j].low;
      else break;
    }
    for (let j = idx + 1; j < below.length; j++) {
      if (below[j].weight >= thresh) hi = below[j].high;
      else break;
    }
    const tier = (hi + lo) / 2 < last * 0.85 ? "value" : "buy";
    zones.push({
      low: pyRound(lo, 2),
      high: pyRound(hi, 2),
      tier,
      label: "成交密集区",
      sources: [`过去 ${vp.lookback} 日 volume profile 峰值`],
    });
  }
  return normalizeSupportZones(zones);
}
