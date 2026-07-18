import { describe, expect, it } from "vitest";

const { tsukiRequest } = await import("./helpers.js");

describe("kernel without Longbridge dependency", () => {
  it("boots cleanly and health stays 200", async () => {
    const res = await tsukiRequest("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("charts CRUD (no market data needed) keeps working fully", async () => {
    const res = await tsukiRequest("/api/charts");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/credentials/status", () => {
  it("reports the CLI-backed credential state in the contract shape", async () => {
    const res = await tsukiRequest("/api/credentials/status");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const { configured, method, lastError, state, cliPath } = body.data;
    expect(method).toBe("cli");
    expect(["ready", "cli_missing", "login_required", "token_unreadable"]).toContain(state);
    expect(configured).toBe(state === "ready");
    if (state === "ready") {
      expect(lastError).toBeNull();
      expect(typeof cliPath).toBe("string");
    } else {
      expect(typeof lastError).toBe("string");
      if (state === "cli_missing") expect(cliPath).toBeNull();
    }
  });
});
