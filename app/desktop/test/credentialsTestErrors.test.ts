import { describe, expect, it } from "vitest";
import { classifyCredentialTestError } from "../src/credentialsTestErrors.js";

describe("classifyCredentialTestError", () => {
  it.each([
    ["access token expired", "auth"],
    ["invalid access token", "auth"],
    ["unauthorized request", "auth"],
    ["request failed with status 401", "auth"],
    ["invalid_api_key supplied", "auth"],
  ])("classifies %s as an auth-rejected message", (raw) => {
    expect(classifyCredentialTestError(raw)).toBe(
      "Longbridge rejected the credentials — check the app key, app secret, and access token.",
    );
  });

  it.each([["request timed out"], ["deadline exceeded"]])("classifies %s as a timeout", (raw) => {
    expect(classifyCredentialTestError(raw)).toBe("Longbridge did not respond in time.");
  });

  it.each([["ENOTFOUND openapi.longbridge.com"], ["network unreachable"]])(
    "classifies %s as a network error",
    (raw) => {
      expect(classifyCredentialTestError(raw)).toBe("Could not reach Longbridge — check the network connection.");
    },
  );

  it("falls back to a generic unknown message for anything else", () => {
    expect(classifyCredentialTestError("some opaque native error 0xdeadbeef")).toBe(
      "Longbridge credential test failed.",
    );
  });

  it("never echoes any part of the input message back", () => {
    const raw = "super-secret-value-should-never-appear";
    const result = classifyCredentialTestError(raw);
    expect(result).not.toContain("super-secret-value-should-never-appear");
  });
});
