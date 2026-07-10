import { describe, expect, it } from "vitest";
import { deriveCredentialsStatusLabel } from "./credentialsStatusLabel";

describe("deriveCredentialsStatusLabel", () => {
  it("shows 已配置 when both the server and the desktop store agree credentials are configured", () => {
    expect(
      deriveCredentialsStatusLabel({ serverConfigured: true, storeConfigured: true, lastError: null }),
    ).toBe("已配置");
  });

  it("shows the OAuth-env line when the server is configured but nothing is in the desktop store (OAuth-only machine)", () => {
    expect(
      deriveCredentialsStatusLabel({ serverConfigured: true, storeConfigured: false, lastError: null }),
    ).toBe("使用 OAuth 环境凭证（无需在此配置）");
  });

  it("shows 未配置 when the server reports not configured and there is no lastError", () => {
    expect(
      deriveCredentialsStatusLabel({ serverConfigured: false, storeConfigured: false, lastError: null }),
    ).toBe("未配置");
  });

  it("shows the mapped friendly error when the server reports not configured and there is a lastError", () => {
    expect(
      deriveCredentialsStatusLabel({
        serverConfigured: false,
        storeConfigured: false,
        lastError: "OS secure storage unavailable",
      }),
    ).toBe("系统钥匙串不可用，请检查系统钥匙串设置");
  });
});
