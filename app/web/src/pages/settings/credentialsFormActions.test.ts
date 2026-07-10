import { describe, expect, it, vi } from "vitest";
import type { CredentialsFormAction, CredentialsFormFields } from "./credentialsFormState";
import { runCredentialsSave, runCredentialsTest } from "./credentialsFormActions";

const fields: CredentialsFormFields = { appKey: "k", appSecret: "s", accessToken: "t" };

describe("runCredentialsTest", () => {
  it("dispatches test-start then test-ok on success", async () => {
    const dispatch = vi.fn<(action: CredentialsFormAction) => void>();
    await runCredentialsTest({ test: async () => ({ ok: true }) }, fields, dispatch);
    expect(dispatch.mock.calls.map((c) => c[0])).toEqual([{ type: "test-start" }, { type: "test-ok" }]);
  });

  it("dispatches test-fail with the friendly message when the bridge resolves {ok:false}", async () => {
    const dispatch = vi.fn<(action: CredentialsFormAction) => void>();
    await runCredentialsTest(
      { test: async () => ({ ok: false, error: "Longbridge rejected the credentials — check the app key, app secret, and access token." }) },
      fields,
      dispatch,
    );
    expect(dispatch).toHaveBeenLastCalledWith({ type: "test-fail", message: "鉴权失败，请检查凭证是否正确" });
  });

  it("dispatches test-fail instead of hanging when the bridge rejects", async () => {
    const dispatch = vi.fn<(action: CredentialsFormAction) => void>();
    await runCredentialsTest(
      { test: async () => Promise.reject(new Error("IPC channel died")) },
      fields,
      dispatch,
    );
    expect(dispatch).toHaveBeenLastCalledWith({ type: "test-fail", message: "IPC channel died" });
  });
});

describe("runCredentialsSave", () => {
  it("dispatches save-start then save-ok and calls onSaved on success", async () => {
    const dispatch = vi.fn<(action: CredentialsFormAction) => void>();
    const onSaved = vi.fn();
    await runCredentialsSave({ set: async () => ({ ok: true }) }, fields, dispatch, onSaved);
    expect(dispatch.mock.calls.map((c) => c[0])).toEqual([{ type: "save-start" }, { type: "save-ok" }]);
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("dispatches save-fail and does not call onSaved when the bridge resolves {ok:false}", async () => {
    const dispatch = vi.fn<(action: CredentialsFormAction) => void>();
    const onSaved = vi.fn();
    await runCredentialsSave(
      { set: async () => ({ ok: false, error: "OS secure storage unavailable" }) },
      fields,
      dispatch,
      onSaved,
    );
    expect(dispatch).toHaveBeenLastCalledWith({ type: "save-fail", message: "系统钥匙串不可用，请检查系统钥匙串设置" });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("dispatches save-fail instead of hanging when the bridge rejects, and does not call onSaved", async () => {
    const dispatch = vi.fn<(action: CredentialsFormAction) => void>();
    const onSaved = vi.fn();
    await runCredentialsSave(
      { set: async () => Promise.reject(new Error("IPC channel died")) },
      fields,
      dispatch,
      onSaved,
    );
    expect(dispatch).toHaveBeenLastCalledWith({ type: "save-fail", message: "IPC channel died" });
    expect(onSaved).not.toHaveBeenCalled();
  });
});
