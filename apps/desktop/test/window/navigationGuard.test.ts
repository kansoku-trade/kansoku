import { describe, expect, it } from "vitest";
import { isAllowedNavigationUrl, isExternalHttpUrl } from "@desktop/window/navigationGuard.js";

describe("isAllowedNavigationUrl", () => {
  it("allows any app:// url in prod mode", () => {
    expect(isAllowedNavigationUrl("app://-/index.html")).toBe(true);
    expect(isAllowedNavigationUrl("app://-/charts/1")).toBe(true);
  });

  it("rejects http(s) urls when no devUrl is configured", () => {
    expect(isAllowedNavigationUrl("https://evil.example.com")).toBe(false);
    expect(isAllowedNavigationUrl("http://localhost:5199")).toBe(false);
  });

  it("allows the dev origin only when devUrl is configured", () => {
    expect(isAllowedNavigationUrl("http://localhost:5199/", { devUrl: "http://localhost:5199" })).toBe(true);
    expect(isAllowedNavigationUrl("http://localhost:5199/charts/1", { devUrl: "http://localhost:5199" })).toBe(true);
  });

  it("rejects a same-scheme different-port origin even with devUrl configured", () => {
    expect(isAllowedNavigationUrl("http://localhost:9999/", { devUrl: "http://localhost:5199" })).toBe(false);
  });

  it("rejects a hostile origin masquerading via markdown link", () => {
    expect(isAllowedNavigationUrl("https://attacker.example.com/phish", { devUrl: "http://localhost:5199" })).toBe(
      false,
    );
  });

  it("rejects malformed urls instead of throwing", () => {
    expect(isAllowedNavigationUrl("not a url")).toBe(false);
  });
});

describe("isExternalHttpUrl", () => {
  it("is true for http/https", () => {
    expect(isExternalHttpUrl("https://example.com")).toBe(true);
    expect(isExternalHttpUrl("http://example.com")).toBe(true);
  });

  it("is false for app:// and malformed urls", () => {
    expect(isExternalHttpUrl("app://-/index.html")).toBe(false);
    expect(isExternalHttpUrl("not a url")).toBe(false);
  });
});
