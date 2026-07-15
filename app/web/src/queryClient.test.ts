import type { Query } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { DEFAULT_GC_TIME, persistOptions, queryClient } from "./queryClient";

function fakeQuery(status: string, persist?: boolean): Query {
  return { state: { status }, meta: persist === undefined ? undefined : { persist } } as unknown as Query;
}

describe("queryClient default options", () => {
  it("sets gcTime to 24 hours so persisted queries survive past a 5-minute idle unmount", () => {
    expect(DEFAULT_GC_TIME).toBe(1000 * 60 * 60 * 24);
    expect(queryClient.getDefaultOptions().queries?.gcTime).toBe(DEFAULT_GC_TIME);
  });
});

describe("persistOptions.dehydrateOptions.shouldDehydrateQuery", () => {
  const shouldDehydrateQuery = persistOptions.dehydrateOptions.shouldDehydrateQuery;

  it("dehydrates a successful query with no persist flag", () => {
    expect(shouldDehydrateQuery(fakeQuery("success"))).toBe(true);
  });

  it("skips queries marked meta.persist === false", () => {
    expect(shouldDehydrateQuery(fakeQuery("success", false))).toBe(false);
  });

  it("skips queries that never reached success", () => {
    expect(shouldDehydrateQuery(fakeQuery("pending"))).toBe(false);
    expect(shouldDehydrateQuery(fakeQuery("error"))).toBe(false);
  });
});
