import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model } from "@earendil-works/pi-ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCredentialStore, type AppCredentialStore } from "../src/ai/credentialStore.js";
import { WebApiLobeHubCloudGateway } from "../src/ai/lobehub/gateway.js";
import { LOBEHUB_API } from "../src/ai/lobehub/types.js";
import { createSecretBox } from "../src/ai/secretBox.js";
import { createDb } from "../src/db/index.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const model: Model<typeof LOBEHUB_API> = {
  id: "test-chat",
  name: "Test Chat",
  api: LOBEHUB_API,
  provider: "lobehub",
  baseUrl: "https://cloud.test",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 8_192,
};

describe("WebApiLobeHubCloudGateway", () => {
  let dir: string;
  let credentials: AppCredentialStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lobehub-gateway-"));
    const db = createDb(join(dir, "app.db"));
    credentials = createCredentialStore(db, createSecretBox(join(dir, "secret.key")));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("maps only enabled chat models and preserves reasoning and vision abilities", async () => {
    const gateway = new WebApiLobeHubCloudGateway({
      baseUrl: "https://cloud.test",
      clientId: "trade-client",
      credentials,
      fetch: vi.fn(async () =>
        json({
          models: [
            {
              id: "chat-vision",
              type: "chat",
              enabled: true,
              displayName: "Chat Vision",
              contextWindowTokens: 200_000,
              maxOutput: 12_000,
              abilities: { reasoning: true, vision: true },
            },
            { id: "image", type: "image", enabled: true },
            { id: "disabled", type: "chat", enabled: false },
          ],
        }),
      ) as typeof fetch,
    });

    await expect(gateway.listModels()).resolves.toEqual([
      expect.objectContaining({
        id: "chat-vision",
        name: "Chat Vision",
        reasoning: true,
        input: ["text", "image"],
        contextWindow: 200_000,
        maxTokens: 12_000,
      }),
    ]);
  });

  it("maps minimal to low for deepseek-v4 effort models, keeps minimal otherwise", async () => {
    const gateway = new WebApiLobeHubCloudGateway({
      baseUrl: "https://cloud.test",
      clientId: "trade-client",
      credentials,
      fetch: vi.fn(async () =>
        json({
          models: [
            {
              id: "deepseek-v4-pro",
              type: "chat",
              enabled: true,
              abilities: { reasoning: true },
              settings: { extendParams: ["deepseekV4ReasoningEffort"] },
            },
            {
              id: "gpt-6",
              type: "chat",
              enabled: true,
              abilities: { reasoning: true },
              settings: { extendParams: ["gpt5ReasoningEffort"] },
            },
          ],
        }),
      ) as typeof fetch,
    });

    const models = await gateway.listModels();
    expect(models[0]).toMatchObject({
      id: "deepseek-v4-pro",
      thinkingLevelMap: { off: null, minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "max" },
    });
    expect(models[1]).toMatchObject({
      id: "gpt-6",
      thinkingLevelMap: { off: null, minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "high" },
    });
  });

  it("completes Device Flow after pending authorization and stores OAuth tokens", async () => {
    let pollCount = 0;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/oidc/device/auth")) {
        return json({
          device_code: "device-secret",
          user_code: "ABCD-EFGH",
          verification_uri: "https://cloud.test/device",
          verification_uri_complete: "https://cloud.test/device?code=ABCD-EFGH",
          expires_in: 600,
          interval: 2,
        });
      }
      pollCount += 1;
      return pollCount === 1
        ? json({ error: "authorization_pending" }, 400)
        : json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600 });
    });
    const gateway = new WebApiLobeHubCloudGateway({
      baseUrl: "https://cloud.test",
      clientId: "trade-client",
      credentials,
      fetch: fetcher as typeof fetch,
      now: () => 1_000,
    });

    await expect(gateway.startDeviceLogin()).resolves.toMatchObject({
      userCode: "ABCD-EFGH",
      intervalSeconds: 2,
    });
    await expect(gateway.pollDeviceLogin()).resolves.toEqual({ status: "pending", intervalSeconds: 2 });
    await expect(gateway.pollDeviceLogin()).resolves.toEqual({ status: "connected" });
    await expect(credentials.read("lobehub")).resolves.toEqual({
      type: "oauth",
      access: "access-1",
      refresh: "refresh-1",
      expires: 3_601_000,
    });
  });

  it("converts Cloud SSE text, reasoning, tools and usage into pi-ai events with trade trace metadata", async () => {
    await credentials.modify("lobehub", async () => ({
      type: "oauth",
      access: "access-1",
      refresh: "refresh-1",
      expires: Date.now() + 3_600_000,
    }));
    let tracePayload: Record<string, unknown> | undefined;
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const trace = headers.get("X-lobe-trace");
      tracePayload = trace ? JSON.parse(Buffer.from(trace, "base64").toString("utf8")) : undefined;
      const body = [
        'event: reasoning\ndata: "先看数据"\n\n',
        'event: text\ndata: "结论"\n\n',
        'event: tool_calls\ndata: [{"index":0,"id":"call-1","type":"function","function":{"name":"fetch_news","arguments":"{\\"symbol\\":\\"NVDA.US\\"}"}}]\n\n',
        'event: usage\ndata: {"totalInputTokens":10,"totalOutputTokens":5,"inputCachedTokens":2,"outputReasoningTokens":1,"totalTokens":15,"cost":0.012}\n\n',
        'event: stop\ndata: "tool_use"\n\n',
      ].join("");
      return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    });
    const gateway = new WebApiLobeHubCloudGateway({
      baseUrl: "https://cloud.test",
      clientId: "trade-client",
      credentials,
      fetch: fetcher as typeof fetch,
    });

    const stream = gateway.stream(
      model,
      { messages: [{ role: "user", content: "分析 NVDA", timestamp: Date.now() }] },
      { sessionId: "chart-1" },
    );
    const events = [];
    for await (const event of stream) events.push(event);
    const result = await stream.result();

    expect(events.map((event) => event.type)).toEqual([
      "start",
      "thinking_start",
      "thinking_delta",
      "text_start",
      "text_delta",
      "text_end",
      "thinking_end",
      "toolcall_start",
      "toolcall_delta",
      "toolcall_end",
      "done",
    ]);
    expect(result.content).toEqual([
      { type: "thinking", thinking: "先看数据" },
      { type: "text", text: "结论" },
      { type: "toolCall", id: "call-1", name: "fetch_news", arguments: { symbol: "NVDA.US" } },
    ]);
    expect(result.usage).toMatchObject({ input: 10, output: 5, cacheRead: 2, reasoning: 1, totalTokens: 15 });
    expect(result.usage.cost.total).toBe(0.012);
    expect(result.stopReason).toBe("toolUse");
    expect(tracePayload).toMatchObject({ sessionId: "trade:chart-1", tags: ["client:trade"] });
  });

  it("maps the requested thinking level through thinkingLevelMap before sending reasoning_effort", async () => {
    await credentials.modify("lobehub", async () => ({
      type: "oauth",
      access: "access-1",
      refresh: "refresh-1",
      expires: Date.now() + 3_600_000,
    }));
    const bodies: Record<string, unknown>[] = [];
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response('event: text\ndata: "ok"\n\nevent: stop\ndata: "stop"\n\n', {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    const gateway = new WebApiLobeHubCloudGateway({
      baseUrl: "https://cloud.test",
      clientId: "trade-client",
      credentials,
      fetch: fetcher as typeof fetch,
    });
    const deepseek = {
      ...model,
      thinkingLevelMap: { off: null, minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "max" },
    };
    const context = { messages: [{ role: "user" as const, content: "hi", timestamp: Date.now() }] };

    for await (const _e of gateway.stream(deepseek, context, { reasoning: "minimal" } as never)) void _e;
    for await (const _e of gateway.stream(deepseek, context, { reasoning: "xhigh" } as never)) void _e;
    for await (const _e of gateway.stream(model, context, { reasoning: "minimal" } as never)) void _e;

    expect(bodies[0].reasoning_effort).toBe("low");
    expect(bodies[1].reasoning_effort).toBe("max");
    expect(bodies[2].reasoning_effort).toBe("minimal");
  });

  it("serializes refresh-token rotation across concurrent quota requests", async () => {
    await credentials.modify("lobehub", async () => ({
      type: "oauth",
      access: "expired",
      refresh: "refresh-old",
      expires: 0,
    }));
    let refreshCalls = 0;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/oidc/token")) {
        refreshCalls += 1;
        return json({ access_token: "fresh", refresh_token: "refresh-new", expires_in: 3600 });
      }
      if (url.includes("subscription.getSubscription")) {
        return json({ result: { data: { json: { plan: "pro", usage: { free: { limit: 500_000, boundedSpend: 100_000 } } } } } });
      }
      return json({ result: { data: { json: { data: [{ spend: 25_000 }], total: 1 } } } });
    });
    const gateway = new WebApiLobeHubCloudGateway({
      baseUrl: "https://cloud.test",
      clientId: "trade-client",
      credentials,
      fetch: fetcher as typeof fetch,
      now: () => 10_000,
    });

    const [first, second] = await Promise.all([gateway.getCredits(), gateway.getCredits()]);
    expect(refreshCalls).toBe(1);
    expect(first).toMatchObject({ availableCredits: 400_000, availableUsd: 0.4, currentMonthUsd: 0.025 });
    expect(second).toMatchObject({ availableCredits: 400_000, currentMonthCredits: 25_000 });
    await expect(credentials.read("lobehub")).resolves.toMatchObject({
      type: "oauth",
      access: "fresh",
      refresh: "refresh-new",
    });
  });
});
