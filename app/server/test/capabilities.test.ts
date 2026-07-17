import { describe, expect, it } from "vitest";
import { tsukiRequest } from "./helpers.js";

describe("GET /capabilities", () => {
  it("reports pro and licensed true when builtin is registered", async () => {
    const res = await tsukiRequest("/api/capabilities");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ pro: true, licensed: true });
  });
});
