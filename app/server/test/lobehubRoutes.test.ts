import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LobeHubCloudGateway, LobeHubDevicePollResult } from "../../packages/core/src/ai/lobehub/types.js";
import { setLobeHubDepsForTests } from "../src/modules/lobehub/lobehub.controller.js";
import { tsukiRequest } from "./helpers.js";

const BASE = "/api/ai/providers/lobehub";

function createGateway(pollResult: LobeHubDevicePollResult = { status: "pending", intervalSeconds: 5 }) {
  const logout = vi.fn(async () => {});
  const gateway: LobeHubCloudGateway = {
    baseUrl: "https://app.lobehub.com",
    available: true,
    async startDeviceLogin() {
      return {
        userCode: "ABCD-EFGH",
        verificationUri: "https://app.lobehub.com/device",
        expiresAt: "2026-07-12T12:00:00.000Z",
        intervalSeconds: 5,
      };
    },
    async pollDeviceLogin() {
      return pollResult;
    },
    async getAccount() {
      return {
        status: "connected",
        email: "investor@example.com",
        name: "Investor",
        userId: "user-1",
        updatedAt: "2026-07-12T11:00:00.000Z",
        baseUrl: "https://app.lobehub.com",
      };
    },
    async getCredits() {
      return {
        availableCredits: 1200,
        availableUsd: 12,
        currentMonthCredits: 300,
        currentMonthUsd: 3,
        plan: "pro",
        updatedAt: "2026-07-12T11:00:00.000Z",
      };
    },
    logout,
    async refreshCredential(credential) {
      return credential;
    },
    async listModels() {
      return [];
    },
    stream() {
      throw new Error("not used in route tests");
    },
  };
  return { gateway, logout };
}

let refresh: (provider?: string) => Promise<void>;

beforeEach(() => {
  refresh = vi.fn(async () => {});
  const { gateway } = createGateway();
  setLobeHubDepsForTests({ gateway, models: { refresh } });
});

afterEach(() => {
  setLobeHubDepsForTests(null);
});

describe("LobeHub provider routes", () => {
  it("serves account and credits outside the settings namespace", async () => {
    const account = await tsukiRequest(`${BASE}/account`);
    expect(account.status).toBe(200);
    expect(await account.json()).toMatchObject({
      ok: true,
      data: { status: "connected", email: "investor@example.com" },
    });

    const credits = await tsukiRequest(`${BASE}/credits`);
    expect(credits.status).toBe(200);
    expect(await credits.json()).toMatchObject({ ok: true, data: { availableCredits: 1200, plan: "pro" } });

    const oldRoute = await tsukiRequest("/api/settings/ai/providers/lobehub/account");
    expect(oldRoute.status).toBe(404);
  });

  it("starts device login and refreshes the model catalog after connection", async () => {
    const { gateway } = createGateway({ status: "connected" });
    setLobeHubDepsForTests({ gateway, models: { refresh } });

    const start = await tsukiRequest(`${BASE}/device-login`, { method: "POST" });
    expect(start.status).toBe(200);
    expect(await start.json()).toMatchObject({ ok: true, data: { userCode: "ABCD-EFGH" } });

    const poll = await tsukiRequest(`${BASE}/device-login/poll`, { method: "POST" });
    expect(poll.status).toBe(200);
    expect(await poll.json()).toEqual({ ok: true, data: { status: "connected" } });
    expect(refresh).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledWith("lobehub");
  });

  it("does not refresh models while authorization is pending and deletes the session", async () => {
    const { gateway, logout } = createGateway();
    setLobeHubDepsForTests({ gateway, models: { refresh } });

    const poll = await tsukiRequest(`${BASE}/device-login/poll`, { method: "POST" });
    expect(poll.status).toBe(200);
    expect(refresh).not.toHaveBeenCalled();

    const deleted = await tsukiRequest(`${BASE}/session`, { method: "DELETE" });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ ok: true, data: { deleted: true } });
    expect(logout).toHaveBeenCalledOnce();
  });
});
