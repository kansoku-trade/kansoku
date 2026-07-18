import { afterEach, describe, expect, it, vi } from "vitest";
import { createDodoClient, resolveDodoBaseUrl } from "../src/license/dodoClient.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("resolveDodoBaseUrl", () => {
  it("defaults dev hosts to test and production hosts to live", () => {
    expect(resolveDodoBaseUrl({} as NodeJS.ProcessEnv, false)).toBe("https://test.dodopayments.com");
    expect(resolveDodoBaseUrl({} as NodeJS.ProcessEnv, true)).toBe("https://live.dodopayments.com");
  });

  it("env flags override the host default", () => {
    expect(resolveDodoBaseUrl({ KANSOKU_DODO_TEST: "1" } as NodeJS.ProcessEnv, true)).toBe(
      "https://test.dodopayments.com",
    );
    expect(resolveDodoBaseUrl({ KANSOKU_DODO_LIVE: "1" } as NodeJS.ProcessEnv, false)).toBe(
      "https://live.dodopayments.com",
    );
  });
});

describe("dodoClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("activate posts license_key/name and returns the instance on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: "lki_abc" }));
    const client = createDodoClient({ fetch: fetchMock, baseUrl: "https://test.dodopayments.com" });

    const result = await client.activate({ licenseKey: "lic_1", name: "my-mac" });

    expect(result).toEqual({ ok: true, data: { id: "lki_abc" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://test.dodopayments.com/licenses/activate");
    expect(JSON.parse(init.body)).toEqual({ license_key: "lic_1", name: "my-mac" });
  });

  it("validate returns ok:true with valid:false as a normal (non-network) result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { valid: false }));
    const client = createDodoClient({ fetch: fetchMock, baseUrl: "https://test.dodopayments.com" });

    const result = await client.validate({ licenseKey: "lic_1", instanceId: "lki_abc" });

    expect(result).toEqual({ ok: true, data: { valid: false } });
  });

  it("deactivate posts license_key/instance_id and does not require a JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const client = createDodoClient({ fetch: fetchMock, baseUrl: "https://test.dodopayments.com" });

    const result = await client.deactivate({ licenseKey: "lic_1", instanceId: "lki_abc" });

    expect(result).toEqual({ ok: true, data: undefined });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ license_key: "lic_1", license_key_instance_id: "lki_abc" });
  });

  it("normalizes a thrown network error to ok:false", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    const client = createDodoClient({ fetch: fetchMock, baseUrl: "https://test.dodopayments.com" });

    const result = await client.validate({ licenseKey: "lic_1", instanceId: "lki_abc" });

    expect(result).toEqual({ ok: false, error: "getaddrinfo ENOTFOUND" });
  });

  it("normalizes a non-2xx HTTP status to ok:false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("boom", { status: 500 }));
    const client = createDodoClient({ fetch: fetchMock, baseUrl: "https://test.dodopayments.com" });

    const result = await client.validate({ licenseKey: "lic_1", instanceId: "lki_abc" });

    expect(result).toEqual({ ok: false, error: "dodo /licenses/validate responded 500" });
  });

  it("aborts and normalizes to ok:false after the 10s timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init: { signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    const client = createDodoClient({
      fetch: fetchMock as unknown as typeof globalThis.fetch,
      baseUrl: "https://test.dodopayments.com",
    });

    const pending = client.validate({ licenseKey: "lic_1", instanceId: "lki_abc" });
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;

    expect(result).toEqual({ ok: false, error: "aborted" });
  });
});
