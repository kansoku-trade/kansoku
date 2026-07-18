import { useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { errorMessage } from "@web/api";
import { client } from "@web/client";
import { Button, Select, Spinner } from "@web/ui";
import { RoleModeControl } from "./RoleModeControl";
import {
  defaultCustom,
  defaultThinkingLevel,
  firstModelId,
  providerKeyReady,
  providerLabel,
  saveRole,
  selectableProviders,
} from "./roleShared";
import type { RoleView } from "./settingsViewModel";
import {
  ROLE_LABEL,
  thinkingLabel,
  type Catalog,
  type CredentialEntry,
  type Role,
  type RoleMode,
  type RoleSetting,
} from "./types";
import { useSaveQueue } from "./useSaveQueue";

export function RoleRow({
  role,
  initial,
  draft,
  catalog,
  credentials,
  view,
  onDraftChange,
}: {
  role: Role;
  initial: RoleSetting;
  draft: RoleSetting;
  catalog: Catalog;
  credentials: CredentialEntry[];
  view: RoleView;
  onDraftChange: (next: RoleSetting) => void;
}) {
  const [failure, setFailure] = useState<{ message: string; retrySnapshot: RoleSetting } | null>(null);
  const [testState, setTestState] = useState<{ status: "idle" | "busy" | "ok" | "fail"; text?: string }>({
    status: "idle",
  });
  const [editing, setEditing] = useState(
    () => initial.mode === "custom" && (!initial.provider || !initial.modelId || !initial.thinkingLevel),
  );

  const queue = useSaveQueue<RoleSetting>({
    initial,
    save: (snapshot) => saveRole(role, snapshot),
    onError: (err, rolledBackTo, retrySnapshot) => {
      onDraftChange(rolledBackTo ?? initial);
      setFailure({ message: errorMessage(err), retrySnapshot });
    },
  });

  const push = (next: RoleSetting) => {
    onDraftChange(next);
    setFailure(null);
    setTestState({ status: "idle" });
    queue.push(next);
  };

  const setMode = (mode: RoleMode) => {
    if (mode === draft.mode) return;
    setEditing(mode === "custom");
    if (mode === "custom" && (!draft.provider || !draft.modelId)) {
      push(defaultCustom(catalog));
      return;
    }
    if (mode !== "custom") {
      push({ mode, provider: null, modelId: null, thinkingLevel: null, stale: false });
      return;
    }
    push({ ...draft, mode });
  };

  const setProvider = (provider: string) => {
    const modelId = firstModelId(catalog, provider);
    push({
      mode: "custom",
      provider,
      modelId,
      thinkingLevel: defaultThinkingLevel(catalog, provider, modelId),
      stale: false,
    });
  };

  const setModelId = (modelId: string) => {
    push({
      ...draft,
      modelId,
      thinkingLevel: defaultThinkingLevel(catalog, draft.provider ?? "", modelId),
    });
  };

  const setThinkingLevel = (thinkingLevel: string) => {
    push({ ...draft, thinkingLevel });
  };

  const provider = draft.provider ? catalog.providers.find((p) => p.id === draft.provider) : null;
  const models = provider?.models ?? [];
  const model = draft.modelId ? models.find((m) => m.id === draft.modelId) : null;
  const thinkingLevels = model?.thinkingLevels ?? [];
  const computedStale = draft.mode === "custom" && Boolean(draft.modelId) && !model;
  const keyMissing =
    draft.mode === "custom" && Boolean(draft.provider) && !providerKeyReady(draft.provider!, credentials, catalog);
  const complete =
    draft.mode === "custom" && Boolean(draft.provider) && Boolean(draft.modelId) && Boolean(draft.thinkingLevel);

  const runTest = async () => {
    if (!draft.provider || !draft.modelId || !draft.thinkingLevel) return;
    setTestState({ status: "busy" });
    try {
      const res = await client.settings.testConnection({
        provider: draft.provider,
        modelId: draft.modelId,
        thinkingLevel: draft.thinkingLevel,
      });
      if (!res.ok) throw new Error(res.hint ? `${res.error} (${res.hint})` : res.error);
      setTestState({ status: "ok", text: `通过 · ${res.latencyMs}ms` });
    } catch (err) {
      setTestState({ status: "fail", text: errorMessage(err) });
    }
  };

  return (
    <div className={"settings-assignment-row settings-assignment-row--" + draft.mode} id={"settings-role-" + role}>
      <div className="settings-role-summary">
        <div className="settings-role-copy">
          <div className="settings-role-heading">
            <span className="settings-role-name">{ROLE_LABEL[role]}</span>
            <span className="settings-role-usage">{view.usageLabel}</span>
          </div>
          <div className={"settings-role-effective settings-role-effective--" + view.tone}>
            {view.effectiveLabel}
            {draft.mode === "custom" && !editing ? (
              <button className="settings-role-edit" type="button" onClick={() => setEditing(true)}>
                修改
              </button>
            ) : null}
          </div>
        </div>
        <div className="settings-role-actions">
          <RoleModeControl role={role} value={draft.mode} onChange={setMode} />
          <span
            className={failure ? "settings-role-status settings-role-status--rollback" : "settings-role-status"}
            aria-live="polite"
          >
            {queue.flushing() ? (
              <Spinner aria-label="保存中" />
            ) : failure ? (
              <>
                <TriangleAlert size={12} className="icon" /> 未保存
              </>
            ) : (
              <Check size={12} className="icon" aria-label="已保存" />
            )}
          </span>
        </div>
      </div>

      {draft.mode === "custom" && editing && (
        <div className="settings-role-editor">
          <div className="settings-role-editor-controls">
            <Select
              value={draft.provider ?? ""}
              options={selectableProviders(catalog, draft.provider).map((p) => ({
                value: p.id,
                label: providerLabel(catalog, p.id),
              }))}
              onChange={setProvider}
            />
            <Select
              value={draft.modelId ?? ""}
              options={models.map((m) => ({ value: m.id, label: m.name }))}
              onChange={setModelId}
            />
            <Select
              value={draft.thinkingLevel ?? "off"}
              options={thinkingLevels.map((t) => ({ value: t, label: thinkingLabel(t) }))}
              onChange={setThinkingLevel}
            />
            <Button disabled={!complete || testState.status === "busy"} onClick={runTest}>
              测试模型
            </Button>
            <button
              className="settings-role-edit settings-role-edit--done"
              type="button"
              disabled={!complete}
              onClick={() => setEditing(false)}
            >
              完成
            </button>
          </div>
          <div className="settings-role-editor-status" aria-live="polite">
            {testState.status === "busy" ? <Spinner aria-label="测试中" /> : null}
            {testState.status === "ok" ? (
              <span className="settings-test-result settings-test-result--ok">{testState.text}</span>
            ) : null}
            {testState.status === "fail" ? (
              <span className="settings-test-result settings-test-result--fail">{testState.text}</span>
            ) : null}
            {computedStale ? <span className="settings-role-warning">模型已不在目录，请改选</span> : null}
            {keyMissing ? <span className="settings-role-warning">该 Provider 未配置认证</span> : null}
          </div>
        </div>
      )}

      {failure ? (
        <div className="settings-save-error" role="alert">
          <span>{failure.message}</span>
          <Button onClick={() => push(failure.retrySnapshot)}>重试</Button>
        </div>
      ) : null}
    </div>
  );
}
