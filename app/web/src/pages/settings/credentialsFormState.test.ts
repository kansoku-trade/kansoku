import { describe, expect, it } from "vitest";
import {
  allCredentialsFieldsFilled,
  credentialsFormReducer,
  emptyCredentialsFields,
  initialCredentialsFormState,
  type CredentialsFormState,
} from "./credentialsFormState";

describe("allCredentialsFieldsFilled", () => {
  it("is false when any field is empty or whitespace", () => {
    expect(allCredentialsFieldsFilled(emptyCredentialsFields)).toBe(false);
    expect(allCredentialsFieldsFilled({ appKey: "k", appSecret: "", accessToken: "t" })).toBe(false);
    expect(allCredentialsFieldsFilled({ appKey: "k", appSecret: " ", accessToken: "t" })).toBe(false);
  });

  it("is true when all three fields are non-empty", () => {
    expect(allCredentialsFieldsFilled({ appKey: "k", appSecret: "s", accessToken: "t" })).toBe(true);
  });
});

describe("credentialsFormReducer", () => {
  it("updates a field and resets any prior test result", () => {
    const tested: CredentialsFormState = { ...initialCredentialsFormState, testStatus: "ok" };
    const next = credentialsFormReducer(tested, { type: "field", key: "appKey", value: "abc" });
    expect(next.fields.appKey).toBe("abc");
    expect(next.testStatus).toBe("idle");
    expect(next.testMessage).toBeNull();
  });

  it("test-start sets testing and clears any prior message", () => {
    const state: CredentialsFormState = { ...initialCredentialsFormState, testMessage: "old" };
    const next = credentialsFormReducer(state, { type: "test-start" });
    expect(next.testStatus).toBe("testing");
    expect(next.testMessage).toBeNull();
  });

  it("test-ok clears message", () => {
    const state: CredentialsFormState = { ...initialCredentialsFormState, testStatus: "testing" };
    const next = credentialsFormReducer(state, { type: "test-ok" });
    expect(next.testStatus).toBe("ok");
    expect(next.testMessage).toBeNull();
  });

  it("test-fail records the friendly message", () => {
    const next = credentialsFormReducer(initialCredentialsFormState, {
      type: "test-fail",
      message: "鉴权失败，请检查凭证是否正确",
    });
    expect(next.testStatus).toBe("fail");
    expect(next.testMessage).toBe("鉴权失败，请检查凭证是否正确");
  });

  it("save-start clears any prior save error", () => {
    const state: CredentialsFormState = { ...initialCredentialsFormState, saveStatus: "fail", saveError: "boom" };
    const next = credentialsFormReducer(state, { type: "save-start" });
    expect(next.saveStatus).toBe("saving");
    expect(next.saveError).toBeNull();
  });

  it("save-fail records the error and keeps entered fields", () => {
    const state: CredentialsFormState = {
      ...initialCredentialsFormState,
      fields: { appKey: "k", appSecret: "s", accessToken: "t" },
      saveStatus: "saving",
    };
    const next = credentialsFormReducer(state, { type: "save-fail", message: "系统钥匙串不可用，请检查系统钥匙串设置" });
    expect(next.saveStatus).toBe("fail");
    expect(next.saveError).toBe("系统钥匙串不可用，请检查系统钥匙串设置");
    expect(next.fields).toEqual({ appKey: "k", appSecret: "s", accessToken: "t" });
  });

  it("save-ok resets the whole form back to initial state", () => {
    const state: CredentialsFormState = {
      fields: { appKey: "k", appSecret: "s", accessToken: "t" },
      testStatus: "ok",
      testMessage: null,
      saveStatus: "saving",
      saveError: null,
    };
    expect(credentialsFormReducer(state, { type: "save-ok" })).toEqual(initialCredentialsFormState);
  });
});
