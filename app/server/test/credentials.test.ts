import { afterEach, describe, expect, it, vi } from "vitest";
import { envCredentialProvider } from "../src/services/credentials/envCredentialProvider.js";
import { getCredentialProvider, initCredentialProvider, setCredentialProviderForTests } from "../src/services/credentials/registry.js";
import type { CredentialProvider } from "../src/services/credentials/types.js";
import { clearCredentialRejection, getLastCredentialError, recordCredentialRejection, resetCredentialStatusForTests } from "../src/services/credentials/credentialStatus.js";

describe("envCredentialProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when any of the three env vars is missing", async () => {
    vi.stubEnv("LONGBRIDGE_APP_KEY", "");
    vi.stubEnv("LONGBRIDGE_APP_SECRET", "secret");
    vi.stubEnv("LONGBRIDGE_ACCESS_TOKEN", "token");
    await expect(envCredentialProvider.getLongbridgeCredentials()).resolves.toBeNull();
  });

  it("returns the credential triple when all three env vars are set", async () => {
    vi.stubEnv("LONGBRIDGE_APP_KEY", "key");
    vi.stubEnv("LONGBRIDGE_APP_SECRET", "secret");
    vi.stubEnv("LONGBRIDGE_ACCESS_TOKEN", "token");
    await expect(envCredentialProvider.getLongbridgeCredentials()).resolves.toEqual({
      appKey: "key",
      appSecret: "secret",
      accessToken: "token",
    });
  });

  it("onChange never fires and returns a no-op unsubscribe", () => {
    const cb = vi.fn();
    const unsub = envCredentialProvider.onChange(cb);
    expect(cb).not.toHaveBeenCalled();
    expect(() => unsub()).not.toThrow();
  });
});

describe("credential provider registry", () => {
  afterEach(() => {
    setCredentialProviderForTests(null);
  });

  it("defaults to envCredentialProvider", () => {
    expect(getCredentialProvider()).toBe(envCredentialProvider);
  });

  it("initCredentialProvider swaps the active provider", () => {
    const fake: CredentialProvider = {
      getLongbridgeCredentials: async () => null,
      onChange: () => () => {},
    };
    initCredentialProvider(fake);
    expect(getCredentialProvider()).toBe(fake);
  });

  it("initCredentialProvider with no argument resets to envCredentialProvider", () => {
    const fake: CredentialProvider = {
      getLongbridgeCredentials: async () => null,
      onChange: () => () => {},
    };
    initCredentialProvider(fake);
    initCredentialProvider();
    expect(getCredentialProvider()).toBe(envCredentialProvider);
  });

  it("setCredentialProviderForTests(null) resets to envCredentialProvider", () => {
    const fake: CredentialProvider = {
      getLongbridgeCredentials: async () => null,
      onChange: () => () => {},
    };
    setCredentialProviderForTests(fake);
    expect(getCredentialProvider()).toBe(fake);
    setCredentialProviderForTests(null);
    expect(getCredentialProvider()).toBe(envCredentialProvider);
  });
});

describe("credentialStatus", () => {
  afterEach(() => {
    resetCredentialStatusForTests();
  });

  it("starts with no last error", () => {
    expect(getLastCredentialError()).toBeNull();
  });

  it("records and clears a rejection message", () => {
    recordCredentialRejection("longbridge quote failed: token expired");
    expect(getLastCredentialError()).toBe("longbridge quote failed: token expired");
    clearCredentialRejection();
    expect(getLastCredentialError()).toBeNull();
  });
});
