import { describe, expect, it } from "vitest";
import { nextSnowflake, snowflakeToDate } from "../src/db/snowflake.js";

const FAR_FUTURE_BASE = Date.now() + 1000 * 60 * 60 * 24 * 365 * 50;

describe("nextSnowflake", () => {
  it("produces unique, strictly increasing ids across a burst", () => {
    const ids: bigint[] = [];
    for (let i = 0; i < 10_000; i++) ids.push(BigInt(nextSnowflake()));

    for (let i = 1; i < ids.length; i++) expect(ids[i] > ids[i - 1]).toBe(true);
    expect(new Set(ids.map(String)).size).toBe(ids.length);
  });

  it("increments the sequence for repeated calls within the same millisecond", () => {
    const frozen = FAR_FUTURE_BASE + 1_000_000;
    const now = () => frozen;

    const a = BigInt(nextSnowflake(now));
    const b = BigInt(nextSnowflake(now));
    const c = BigInt(nextSnowflake(now));

    expect(b - a).toBe(1n);
    expect(c - b).toBe(1n);
    expect(snowflakeToDate(String(a)).getTime()).toBe(frozen);
    expect(snowflakeToDate(String(c)).getTime()).toBe(frozen);
  });

  it("rolls over to the next millisecond when the sequence overflows", () => {
    const base = FAR_FUTURE_BASE + 2_000_000;
    let calls = 0;
    let invocations = 0;
    const now = () => {
      calls++;
      return calls > invocations ? base + 1 : base;
    };

    const ids: bigint[] = [];
    for (let i = 0; i < 4098; i++) {
      invocations++;
      ids.push(BigInt(nextSnowflake(now)));
    }

    for (let i = 1; i < ids.length; i++) expect(ids[i] > ids[i - 1]).toBe(true);
    expect(new Set(ids.map(String)).size).toBe(ids.length);

    const rolledOverIndex = ids.findIndex((id) => snowflakeToDate(String(id)).getTime() > base);
    expect(rolledOverIndex).toBeGreaterThan(0);
    expect(rolledOverIndex).toBeLessThanOrEqual(4097);
  });

  it("never emits a timestamp earlier than the last one used when the clock regresses", () => {
    const base = FAR_FUTURE_BASE + 3_000_000;
    let t = base;
    const now = () => t;

    const first = BigInt(nextSnowflake(now));
    t = base - 5000;
    const second = BigInt(nextSnowflake(now));

    expect(second > first).toBe(true);
    expect(snowflakeToDate(String(second)).getTime()).toBeGreaterThanOrEqual(base);
  });

  it("round-trips the injected timestamp via snowflakeToDate", () => {
    const ts = FAR_FUTURE_BASE + 4_000_000;
    const id = nextSnowflake(() => ts);

    expect(snowflakeToDate(id).getTime()).toBe(ts);
  });
});
