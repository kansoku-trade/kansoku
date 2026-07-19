import { describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env.js";
import { createRequestHandler } from "../src/index.js";
import { createThrottle } from "../src/throttle.js";

const env: Env = {
  DODO_BASE_URL: "https://test.dodopayments.com",
  BUNDLE_KEY: "b".repeat(64),
  BUNDLE_KEY_ID: "key-1",
};

function post(path: string, body: unknown): Request {
  return new Request(`https://worker.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fakeFetch(response: { status: number; body: unknown }): typeof globalThis.fetch {
  return vi.fn(async () => new Response(JSON.stringify(response.body), { status: response.status })) as unknown as typeof globalThis.fetch;
}

function handlerWith(fetchImpl: typeof globalThis.fetch, now: () => number = () => 0) {
  return createRequestHandler({ fetch: fetchImpl, env, throttle: createThrottle(), now });
}

describe("license-worker activate", () => {
  it("forwards to Dodo /licenses/activate and appends bundleKey+keyId on 201", async () => {
    const fetchImpl = fakeFetch({ status: 201, body: { id: "lki_1" } });
    const handler = handlerWith(fetchImpl);

    const res = await handler(post("/activate", { license_key: "lic_1", name: "my-mac" }));

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://test.dodopayments.com/licenses/activate",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ license_key: "lic_1", name: "my-mac" }) }),
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ id: "lki_1", bundleKey: env.BUNDLE_KEY, keyId: env.BUNDLE_KEY_ID });
  });

  it("passes through Dodo failure responses without a bundleKey", async () => {
    const fetchImpl = fakeFetch({ status: 400, body: { error: "invalid license" } });
    const handler = handlerWith(fetchImpl);

    const res = await handler(post("/activate", { license_key: "lic_1", name: "my-mac" }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid license" });
  });
});

describe("license-worker validate", () => {
  it("appends bundleKey+keyId when valid is true", async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { valid: true } });
    const handler = handlerWith(fetchImpl);

    const res = await handler(post("/validate", { license_key: "lic_1", license_key_instance_id: "lki_1" }));

    expect(fetchImpl).toHaveBeenCalledWith("https://test.dodopayments.com/licenses/validate", expect.anything());
    await expect(res.json()).resolves.toEqual({ valid: true, bundleKey: env.BUNDLE_KEY, keyId: env.BUNDLE_KEY_ID });
  });

  it("serves the /licenses/* paths the shipped desktop client (>= 0.18.0) calls", async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { valid: true } });
    const handler = handlerWith(fetchImpl);

    const res = await handler(
      post("/licenses/validate", { license_key: "lic_1", license_key_instance_id: "lki_1" }),
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://test.dodopayments.com/licenses/validate",
      expect.anything(),
    );
    await expect(res.json()).resolves.toEqual({
      valid: true,
      bundleKey: env.BUNDLE_KEY,
      keyId: env.BUNDLE_KEY_ID,
    });
  });

  it("does not append a key when valid is false", async () => {
    const fetchImpl = fakeFetch({ status: 200, body: { valid: false } });
    const handler = handlerWith(fetchImpl);

    const res = await handler(post("/validate", { license_key: "lic_1", license_key_instance_id: "lki_1" }));

    await expect(res.json()).resolves.toEqual({ valid: false });
  });
});

describe("license-worker deactivate", () => {
  it("is a pure passthrough, never appending a key", async () => {
    const fetchImpl = fakeFetch({ status: 200, body: {} });
    const handler = handlerWith(fetchImpl);

    const res = await handler(post("/deactivate", { license_key: "lic_1", license_key_instance_id: "lki_1" }));

    expect(fetchImpl).toHaveBeenCalledWith("https://test.dodopayments.com/licenses/deactivate", expect.anything());
    await expect(res.json()).resolves.toEqual({});
  });
});

describe("license-worker routing", () => {
  it("404s on unknown paths", async () => {
    const handler = handlerWith(fakeFetch({ status: 200, body: {} }));
    const res = await handler(post("/unknown", {}));
    expect(res.status).toBe(404);
  });

  it("405s on non-POST methods", async () => {
    const handler = handlerWith(fakeFetch({ status: 200, body: {} }));
    const res = await handler(new Request("https://worker.example/activate", { method: "GET" }));
    expect(res.status).toBe(405);
  });

  it("400s on malformed JSON bodies without calling Dodo", async () => {
    const fetchImpl = fakeFetch({ status: 200, body: {} });
    const handler = handlerWith(fetchImpl);
    const res = await handler(
      new Request("https://worker.example/activate", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("license-worker throttle", () => {
  it("rate-limits a license key past the per-window cap without calling Dodo", async () => {
    const fetchImpl = fakeFetch({ status: 201, body: { id: "lki_1" } });
    const throttle = createThrottle();
    const handler = createRequestHandler({ fetch: fetchImpl, env, throttle, now: () => 0 });

    for (let i = 0; i < 20; i++) {
      const res = await handler(post("/activate", { license_key: "lic_throttled", name: "my-mac" }));
      expect(res.status).toBe(201);
    }
    const res = await handler(post("/activate", { license_key: "lic_throttled", name: "my-mac" }));

    expect(res.status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(20);
  });

  it("resets the throttle window over time", async () => {
    const fetchImpl = fakeFetch({ status: 201, body: { id: "lki_1" } });
    const throttle = createThrottle();
    let now = 0;
    const handler = createRequestHandler({ fetch: fetchImpl, env, throttle, now: () => now });

    for (let i = 0; i < 20; i++) {
      await handler(post("/activate", { license_key: "lic_windowed", name: "my-mac" }));
    }
    now = 61_000;
    const res = await handler(post("/activate", { license_key: "lic_windowed", name: "my-mac" }));

    expect(res.status).toBe(201);
  });
});
