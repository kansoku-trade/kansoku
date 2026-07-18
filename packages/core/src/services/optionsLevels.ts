import type { IntradayOptionsLevels, OptionsWallLevel } from "@kansoku/shared/types";
import { marketOf } from "./symbol.utils.js";

const CBOE_BASE = "https://cdn.cboe.com/api/global/delayed_quotes/options";
// OI settles once per day after the close; 15min only bounds intraday volume staleness.
const TTL_MS = 15 * 60_000;
const FAIL_TTL_MS = 5 * 60_000;
const NEAR_EXPIRIES = 2;
const SPOT_BAND = 0.15;
const MIN_OI = 100;
const TOP_WALLS = 8;

const OPT_RE = /^([A-Z.]+?)(\d{6})([CP])(\d{8})$/;

const cache = new Map<string, { at: number; data: IntradayOptionsLevels | null }>();

interface CboeOption {
  option: string;
  open_interest?: number;
  volume?: number;
}

function aggregate(sym: string, payload: unknown): IntradayOptionsLevels | null {
  const data = (payload as { data?: { current_price?: number; options?: CboeOption[] } }).data;
  const options = data?.options;
  if (!Array.isArray(options) || !options.length) return null;
  const spot = typeof data?.current_price === "number" ? data.current_price : null;

  const today = new Date().toISOString().slice(0, 10);
  const byExpiry = new Map<string, Map<number, { call_oi: number; put_oi: number }>>();
  for (const o of options) {
    const m = OPT_RE.exec(o.option ?? "");
    if (!m) continue;
    const expiry = `20${m[2].slice(0, 2)}-${m[2].slice(2, 4)}-${m[2].slice(4, 6)}`;
    if (expiry < today) continue;
    const strike = Number(m[4]) / 1000;
    if (spot !== null && Math.abs(strike - spot) > spot * SPOT_BAND) continue;
    const oi = Number(o.open_interest) || 0;
    let strikes = byExpiry.get(expiry);
    if (!strikes) byExpiry.set(expiry, (strikes = new Map()));
    let slot = strikes.get(strike);
    if (!slot) strikes.set(strike, (slot = { call_oi: 0, put_oi: 0 }));
    slot[m[3] === "C" ? "call_oi" : "put_oi"] += oi;
  }

  const expiries = [...byExpiry.keys()].sort().slice(0, NEAR_EXPIRIES);
  const merged = new Map<number, { call_oi: number; put_oi: number }>();
  for (const expiry of expiries) {
    for (const [strike, v] of byExpiry.get(expiry)!) {
      let slot = merged.get(strike);
      if (!slot) merged.set(strike, (slot = { call_oi: 0, put_oi: 0 }));
      slot.call_oi += v.call_oi;
      slot.put_oi += v.put_oi;
    }
  }

  const walls: OptionsWallLevel[] = [...merged.entries()]
    .map(([strike, v]) => ({ strike, ...v, dominant: (v.call_oi >= v.put_oi ? "call" : "put") as "call" | "put" }))
    .filter((w) => w.call_oi + w.put_oi >= MIN_OI)
    .sort((a, b) => b.call_oi + b.put_oi - (a.call_oi + a.put_oi))
    .slice(0, TOP_WALLS)
    .sort((a, b) => a.strike - b.strike);
  if (!walls.length) return null;

  let callOi = 0;
  let putOi = 0;
  for (const o of options) {
    const m = OPT_RE.exec(o.option ?? "");
    if (!m) continue;
    if (m[3] === "C") callOi += Number(o.open_interest) || 0;
    else putOi += Number(o.open_interest) || 0;
  }

  return {
    spot,
    put_call_oi_ratio: callOi ? Math.round((putOi / callOi) * 1000) / 1000 : null,
    expiries,
    walls,
    updated_at: new Date().toISOString(),
  };
}

export async function getOptionsLevels(symbol: string): Promise<IntradayOptionsLevels | null> {
  if (marketOf(symbol) !== "US") return null;
  const sym = symbol.replace(/\.US$/i, "").toUpperCase();
  if (sym.startsWith(".")) return null;
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < (hit.data ? TTL_MS : FAIL_TTL_MS)) return hit.data;
  let data: IntradayOptionsLevels | null = null;
  try {
    const res = await fetch(`${CBOE_BASE}/${sym}.json`, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) data = aggregate(sym, await res.json());
  } catch {
    data = null;
  }
  cache.set(sym, { at: Date.now(), data });
  return data;
}
