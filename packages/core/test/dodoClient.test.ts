import { afterEach, describe, expect, it, vi } from "vitest";
import { createDodoClient, resolveLicenseApiUrl } from "../src/license/dodoClient.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("resolveLicenseApiUrl", () => {
  it("defaults to the placeholder Worker URL when the env var is unset", () => {
    expect(resolveLicenseApiUrl({} as NodeJS.ProcessEnv)).toBe("https://kansoku-portal.innei.dev");
  });

  it("uses KANSOKU_LICENSE_API_URL when set", () => {
    expect(resolveLicenseApiUrl({ KANSOKU_LICENSE_API_URL: "https://staging.example.com" } as NodeJS.ProcessEnv)).toBe(
      "https://staging.example.com",
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

  it("activate/validate include device_public_key only when provided", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(201, { id: "lki_abc" }))
      .mockResolvedValueOnce(jsonResponse(200, { valid: true }));
    const client = createDodoClient({ fetch: fetchMock, baseUrl: "https://worker.example" });

    await client.activate({ licenseKey: "lic_1", name: "my-mac", devicePublicKey: "PUBKEY_B64" });
    await client.validate({ licenseKey: "lic_1", instanceId: "lki_abc", devicePublicKey: "PUBKEY_B64" });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      license_key: "lic_1",
      name: "my-mac",
      device_public_key: "PUBKEY_B64",
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      license_key: "lic_1",
      license_key_instance_id: "lki_abc",
      device_public_key: "PUBKEY_B64",
    });
  });

  it("validate returns ok:true with valid:false as a normal (non-network) result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { valid: false }));
    const client = createDodoClient({ fetch: fetchMock, baseUrl: "https://test.dodopayments.com" });

    const result = await client.validate({ licenseKey: "lic_1", instanceId: "lki_abc" });

    expect(result).toEqual({ ok: true, data: { valid: false } });
  });

  it("activate surfaces bundleKey/keyId appended by the Worker", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: "lki_abc", bundleKey: "b".repeat(64), keyId: "key-1" }));
    const client = createDodoClient({ fetch: fetchMock, baseUrl: "https://worker.example" });

    const result = await client.activate({ licenseKey: "lic_1", name: "my-mac" });

    expect(result).toEqual({ ok: true, data: { id: "lki_abc", bundleKey: "b".repeat(64), keyId: "key-1" } });
  });

  it("validate surfaces bundleKey/keyId appended by the Worker when valid", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { valid: true, bundleKey: "b".repeat(64), keyId: "key-1" }));
    const client = createDodoClient({ fetch: fetchMock, baseUrl: "https://worker.example" });

    const result = await client.validate({ licenseKey: "lic_1", instanceId: "lki_abc" });

    expect(result).toEqual({ ok: true, data: { valid: true, bundleKey: "b".repeat(64), keyId: "key-1" } });
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
