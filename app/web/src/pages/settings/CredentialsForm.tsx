import { Button, Input } from "../../ui";
import type { DesktopCredentialsBridge } from "./desktopCredentials";
import { useCredentialsForm } from "./useCredentialsForm";

export function CredentialsForm({
  bridge,
  submitLabel,
  hint,
  onSaved,
}: {
  bridge: DesktopCredentialsBridge;
  submitLabel: string;
  hint?: string;
  onSaved: () => void;
}) {
  const { state, canSubmit, setField, handleTest, handleSave } = useCredentialsForm(bridge, onSaved);

  return (
    <div className="credentials-form">
      {hint && <div className="settings-footer-note">{hint}</div>}
      <label className="credentials-form-label">
        App Key
        <Input value={state.fields.appKey} onChange={(e) => setField("appKey", e.target.value)} placeholder="App Key" />
      </label>
      <label className="credentials-form-label">
        App Secret
        <Input
          type="password"
          value={state.fields.appSecret}
          onChange={(e) => setField("appSecret", e.target.value)}
          placeholder="App Secret"
        />
      </label>
      <label className="credentials-form-label">
        Access Token
        <Input
          type="password"
          value={state.fields.accessToken}
          onChange={(e) => setField("accessToken", e.target.value)}
          placeholder="Access Token"
        />
      </label>

      <div className="credentials-form-actions">
        <Button disabled={!canSubmit} state={state.testStatus === "testing" ? "busy" : undefined} onClick={handleTest}>
          测试连接
        </Button>
        <Button
          accent
          disabled={!canSubmit}
          state={state.saveStatus === "saving" ? "busy" : undefined}
          onClick={handleSave}
        >
          {submitLabel}
        </Button>
      </div>

      {state.testStatus === "ok" && <div className="settings-test-result settings-test-result--ok">连接成功</div>}
      {state.testStatus === "fail" && state.testMessage && (
        <div className="settings-test-result settings-test-result--fail">{state.testMessage}</div>
      )}
      {state.saveStatus === "fail" && state.saveError && (
        <div className="settings-test-result settings-test-result--fail">{state.saveError}</div>
      )}
    </div>
  );
}
