import { describe, expect, it, vi } from "vitest";

const fromApikey = vi.fn();
const quote = vi.fn();
const contextNew = vi.fn();

vi.mock("longbridge", () => ({
  Config: { fromApikey },
  QuoteContext: { new: contextNew },
}));

const { testLongbridgeCredentials } = await import("../src/credentialsTest.js");

const CREDS = { appKey: "real-app-key", appSecret: "real-app-secret", accessToken: "real-access-token" };

describe("testLongbridgeCredentials", () => {
  it("returns ok when the quote call succeeds", async () => {
    fromApikey.mockReturnValue("config");
    contextNew.mockResolvedValue({ quote });
    quote.mockResolvedValue([{}]);

    const result = await testLongbridgeCredentials(CREDS);
    expect(result).toEqual({ ok: true });
    expect(fromApikey).toHaveBeenCalledWith(CREDS.appKey, CREDS.appSecret, CREDS.accessToken);
  });

  it("returns a fixed safe message and never echoes the submitted secrets on failure", async () => {
    fromApikey.mockReturnValue("config");
    contextNew.mockRejectedValue(
      new Error(`token invalid for key ${CREDS.appKey} secret ${CREDS.appSecret} token ${CREDS.accessToken}`),
    );

    const result = await testLongbridgeCredentials(CREDS);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).not.toContain(CREDS.appKey);
    expect(result.error).not.toContain(CREDS.appSecret);
    expect(result.error).not.toContain(CREDS.accessToken);
    expect(result.error).toBe(
      "Longbridge rejected the credentials — check the app key, app secret, and access token.",
    );
  });

  it("classifies a non-Error rejection as the generic unknown message without leaking it", async () => {
    fromApikey.mockReturnValue("config");
    contextNew.mockRejectedValue("raw string failure containing real-access-token");

    const result = await testLongbridgeCredentials(CREDS);
    expect(result).toEqual({ ok: false, error: "Longbridge credential test failed." });
  });
});
