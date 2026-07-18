import { describe, expect, it } from "vitest";
import type { ReassessPack } from "../src/ai/datapack.js";
import {
  type DirectionalVerification,
  isDirectionalClaim,
  rejectAnswer,
  verifyDirectionalRead,
} from "../src/ai/verifyRead.js";

// 2026-07-13 was a Monday. 13:30Z = 09:30 ET open; 12:00Z = 08:00 ET pre-market.
const bar = (iso: string, high: number, low: number, close: number) => ({
  time: iso,
  open: low,
  high,
  low,
  close,
  volume: 1000,
});

function pack(overrides: Partial<ReassessPack> = {}): ReassessPack {
  return {
    symbol: "MU.US",
    as_of: "2026-07-13T18:00:00Z",
    timeframes: {
      m5: {
        bars: [
          bar("2026-07-13T12:00:00Z", 954, 913, 950), // pre-market
          bar("2026-07-13T14:00:00Z", 943, 902, 930), // regular
          bar("2026-07-13T17:55:00Z", 935, 925, 930), // regular, last
        ],
        summary: null,
      },
      m15: { bars: [], summary: null },
      h1: { bars: [], summary: null },
    },
    flow: [],
    rel_volume: null,
    day_levels: {
      prev_day: { high: 998, low: 954, close: 979.3 },
      pre_market: { high: 954, low: 913 },
      opening_range: null,
    },
    day_context: null,
    options_levels: null,
    event_risk: null,
    lessons: [],
    market: { spy: null, qqq: null },
    news: [],
    prediction: null,
    prediction_chart_id: null,
    position: null,
    ...overrides,
  } as ReassessPack;
}

const NOW = new Date("2026-07-13T18:00:00Z");

describe("isDirectionalClaim", () => {
  it.each([
    "是不是突破了",
    "存储是不是完蛋了",
    "见底了吧",
    "主力在砸盘吧",
    "MU 要涨了",
    "did it break out?",
    "looks like capitulation",
  ])("flags %j", (text) => {
    expect(isDirectionalClaim(text)).toBe(true);
  });

  it.each(["帮我看下这份分析的止损位是多少", "MACD 是什么意思", "这个预测什么时候做的"])(
    "leaves the ordinary question %j alone",
    (text) => {
      expect(isDirectionalClaim(text)).toBe(false);
    },
  );
});

describe("verifyDirectionalRead", () => {
  it("contradicts a breakout claim when the cash high never reached the pre-market high", () => {
    // The exact 2026-07-13 shape: pre-market high 954, cash high 943, last 930.
    const v = verifyDirectionalRead(pack(), "v1", NOW);
    expect(v.pre_market_high).toBe(954);
    expect(v.cash_high_today).toBe(943);
    expect(v.checks.above_pre_market_high).toBe(false);
    expect(v.checks.cash_high_cleared_pre_market_high).toBe(false);
    expect(v.breakout_verdict).toBe("contradicted");
    expect(v.notes.join()).toContain("从未触及盘前高");
  });

  it("supports a breakout only when price clears both the pre-market high and the prior day high", () => {
    const v = verifyDirectionalRead(
      pack({
        timeframes: {
          m5: {
            bars: [bar("2026-07-13T12:00:00Z", 954, 913, 950), bar("2026-07-13T17:55:00Z", 1005, 990, 1002)],
            summary: null,
          },
          m15: { bars: [], summary: null },
          h1: { bars: [], summary: null },
        },
      }),
      "v1",
      NOW,
    );
    expect(v.breakout_verdict).toBe("supported");
  });

  it("calls a poke-above-then-fade partial, and names it a failed breakout", () => {
    const v = verifyDirectionalRead(
      pack({
        timeframes: {
          m5: {
            bars: [
              bar("2026-07-13T12:00:00Z", 954, 913, 950),
              bar("2026-07-13T14:00:00Z", 960, 940, 945), // pokes above 954 …
              bar("2026-07-13T17:55:00Z", 948, 940, 942), // … then loses it
            ],
            summary: null,
          },
          m15: { bars: [], summary: null },
          h1: { bars: [], summary: null },
        },
      }),
      "v1",
      NOW,
    );
    expect(v.breakout_verdict).toBe("partial");
    expect(v.notes.join()).toContain("假突破");
  });

  it("reports insufficient when the pre-market range is unavailable", () => {
    const v = verifyDirectionalRead(
      pack({ day_levels: { prev_day: null, pre_market: null, opening_range: null } }),
      "v1",
      new Date("2026-07-13T22:30:00Z"),
    );
    expect(v.data_complete).toBe(false);
    expect(v.breakout_verdict).toBe("insufficient");
  });
});

describe("rejectAnswer — the code-level half of TD-VERIFY-01", () => {
  const contradicted = verifyDirectionalRead(pack(), "v1", NOW);
  const minted = new Map<string, DirectionalVerification>([["v1", contradicted]]);

  it("rejects an answer that skipped verification entirely", () => {
    expect(rejectAnswer({ claim_status: "supported", answer: "" } as never, minted)).toContain(
      "verify_directional_read",
    );
  });

  it("rejects a verification_id it never minted", () => {
    expect(rejectAnswer({ claim_status: "supported", verification_id: "made-up" }, minted)).toContain("不接受");
  });

  it("rejects agreeing with the user when the mechanical check contradicts them", () => {
    const err = rejectAnswer({ claim_status: "supported", verification_id: "v1" }, minted);
    expect(err).toContain("contradicted");
  });

  it("accepts the correction", () => {
    expect(rejectAnswer({ claim_status: "contradicted", verification_id: "v1" }, minted)).toBeNull();
  });

  it("accepts partial and insufficient too — the gate blocks sycophancy, not disagreement", () => {
    expect(rejectAnswer({ claim_status: "partial", verification_id: "v1" }, minted)).toBeNull();
    expect(rejectAnswer({ claim_status: "insufficient", verification_id: "v1" }, minted)).toBeNull();
  });

  it("forces insufficient when the data is incomplete — no taking sides on missing data", () => {
    const thin = verifyDirectionalRead(
      pack({ day_levels: { prev_day: null, pre_market: null, opening_range: null } }),
      "v2",
      NOW,
    );
    const m = new Map<string, DirectionalVerification>([["v2", thin]]);
    expect(rejectAnswer({ claim_status: "contradicted", verification_id: "v2" }, m)).toContain("insufficient");
    expect(rejectAnswer({ claim_status: "insufficient", verification_id: "v2" }, m)).toBeNull();
  });
});
