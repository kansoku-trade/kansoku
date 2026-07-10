import { useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { api, errorMessage } from "../../api";
import { Button, Chip, openModal, Select, Spinner } from "../../ui";
import { defaultCustom, firstModelId, providerKeyReady, providerLabel, saveRole } from "./roleShared";
import { thinkingLabel, type Catalog, type CredentialEntry, type RoleSetting } from "./types";
import { useSaveQueue } from "./useSaveQueue";

export function PrimaryRow({
  setting,
  catalog,
  credentials,
  onDraft,
}: {
  setting: RoleSetting;
  catalog: Catalog;
  credentials: CredentialEntry[];
  onDraft: (next: RoleSetting) => void;
}) {
  const [draft, setDraftState] = useState(setting);
  const [rolledBack, setRolledBack] = useState(false);
  const [testState, setTestState] = useState<{ status: "idle" | "busy" | "ok" | "fail"; text?: string }>({
    status: "idle",
  });

  const setDraft = (next: RoleSetting) => {
    setDraftState(next);
    onDraft(next);
  };

  const queue = useSaveQueue<RoleSetting>({
    initial: setting,
    save: (snapshot) => saveRole("primary", snapshot),
    onError: (_err, rolledBackTo) => {
      setDraft(rolledBackTo ?? setting);
      setRolledBack(true);
    },
  });

  const push = (next: RoleSetting) => {
    setDraft(next);
    setRolledBack(false);
    setTestState({ status: "idle" });
    queue.push(next);
  };

  const setProvider = (provider: string) => {
    push({ mode: "custom", provider, modelId: firstModelId(catalog, provider), thinkingLevel: "off", stale: false });
  };

  const setModelId = (modelId: string) => {
    push({ ...draft, modelId, thinkingLevel: "off" });
  };

  const setThinkingLevel = (thinkingLevel: string) => {
    push({ ...draft, thinkingLevel });
  };

  const clear = () => {
    openModal({
      title: "清除主模型",
      body: (closeModal) => (
        <div className="settings-reset-confirm">
          <p>清除后，所有「跟随主模型」的用途将变为未配置，直到重新设置主模型。确定继续吗？</p>
          <div className="settings-cred-actions">
            <Button onClick={closeModal}>取消</Button>
            <Button
              accent
              onClick={() => {
                push({ mode: "disabled", provider: null, modelId: null, thinkingLevel: null, stale: false });
                closeModal();
              }}
            >
              确认清除
            </Button>
          </div>
        </div>
      ),
    });
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
      const res = await api<{ latencyMs: number }>("/api/settings/ai/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: draft.provider, modelId: draft.modelId, thinkingLevel: draft.thinkingLevel }),
      });
      setTestState({ status: "ok", text: `✓ ${res.latencyMs}ms` });
    } catch (err) {
      setTestState({ status: "fail", text: errorMessage(err) });
    }
  };

  return (
    <div className="settings-role-row settings-primary-row">
      <div className="settings-role-head">
        <span className="settings-role-name">主模型</span>
        {draft.mode !== "custom" && <Chip onClick={() => push(defaultCustom(catalog))}>设置主模型</Chip>}
        <span className={`settings-role-status${rolledBack ? " settings-role-status--rollback" : ""}`}>
          {queue.flushing() ? (
            <Spinner />
          ) : rolledBack ? (
            <>
              <TriangleAlert size={12} className="icon" /> 未保存
            </>
          ) : (
            <Check size={12} className="icon" />
          )}
        </span>
      </div>

      {draft.mode === "custom" && (
        <div className="settings-role-body">
          <Select
            value={draft.provider ?? ""}
            options={catalog.providers.map((p) => ({ value: p.id, label: providerLabel(catalog, p.id) }))}
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
            测试
          </Button>
          {testState.status === "busy" && <Spinner />}
          {testState.status === "ok" && (
            <span className="settings-test-result settings-test-result--ok">{testState.text}</span>
          )}
          {testState.status === "fail" && (
            <span className="settings-test-result settings-test-result--fail">{testState.text}</span>
          )}
          <button type="button" className="settings-primary-clear" onClick={clear}>
            清除
          </button>
        </div>
      )}

      {draft.mode !== "custom" && (
        <div className="settings-role-warning">未设置——所有「跟随主模型」的用途都处于暂停</div>
      )}
      {computedStale && <div className="settings-role-warning">模型已不在目录，请改选</div>}
      {keyMissing && <div className="settings-role-warning">该 provider 未配 key</div>}
    </div>
  );
}
