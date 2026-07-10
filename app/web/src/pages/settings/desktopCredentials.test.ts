import { describe, expect, it } from "vitest";
import { friendlyCredentialError, getDesktopCredentialsBridge } from "./desktopCredentials";

describe("getDesktopCredentialsBridge", () => {
  it("returns null when window.desktop is absent (plain browser)", () => {
    expect(getDesktopCredentialsBridge({} as unknown)).toBeNull();
  });

  it("returns null when window.desktop.credentials is absent", () => {
    expect(getDesktopCredentialsBridge({ desktop: {} } as unknown)).toBeNull();
  });

  it("returns the bridge when window.desktop.credentials is present", () => {
    const bridge = {
      get: async () => ({ configured: true, lastError: null }),
      set: async () => ({ ok: true as const }),
      clear: async () => {},
      test: async () => ({ ok: true as const }),
    };
    expect(getDesktopCredentialsBridge({ desktop: { credentials: bridge } } as unknown)).toBe(bridge);
  });
});

describe("friendlyCredentialError", () => {
  it("returns null for null input", () => {
    expect(friendlyCredentialError(null)).toBeNull();
  });

  it("maps keychain unavailability", () => {
    expect(friendlyCredentialError("OS secure storage unavailable")).toBe("系统钥匙串不可用，请检查系统钥匙串设置");
  });

  it("maps corrupt credential file / decrypt failure", () => {
    expect(friendlyCredentialError("corrupt credentials file")).toBe("凭证文件已损坏，请重新填写并保存");
    expect(friendlyCredentialError("corrupt credentials payload")).toBe("凭证文件已损坏，请重新填写并保存");
    expect(friendlyCredentialError("failed to decrypt credentials")).toBe("凭证文件已损坏，请重新填写并保存");
  });

  it("maps auth rejection from the test() SAFE_MESSAGES text", () => {
    expect(
      friendlyCredentialError("Longbridge rejected the credentials — check the app key, app secret, and access token."),
    ).toBe("鉴权失败，请检查凭证是否正确");
  });

  it("maps network error", () => {
    expect(friendlyCredentialError("Could not reach Longbridge — check the network connection.")).toBe(
      "网络错误，请检查网络连接后重试",
    );
  });

  it("maps timeout", () => {
    expect(friendlyCredentialError("Longbridge did not respond in time.")).toBe("连接超时，请稍后重试");
  });

  it("falls back to the raw message for unrecognized errors", () => {
    expect(friendlyCredentialError("some unexpected message")).toBe("some unexpected message");
  });
});
