import { useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { api, errorMessage } from "../../api";
import { Button, Chip, Select, Spinner } from "../../ui";
import {
  CODEX_PROVIDER,
  ROLE_LABEL,
  type Catalog,
  type CredentialEntry,
  type Role,
  type RoleMode,
  type RoleSetting,
} from "./types";
import { useSaveQueue } from "./useSaveQueue";

type RoleSettingResponse = Omit<RoleSetting, "stale">;

function firstModelId(catalog: Catalog, providerId: string): string | null {
  return catalog.providers.find((p) => p.id === providerId)?.models[0]?.id ?? null;
}

function providerLabel(catalog: Catalog, providerId: string): string {
  const provider = catalog.providers.find((p) => p.id === providerId);
  if (!provider) return providerId;
  return provider.auth.status === "configured" ? provider.name : `${provider.name}（未配 key）`;
}

function providerKeyReady(providerId: string, credentials: CredentialEntry[], catalog: Catalog): boolean {
  if (providerId === CODEX_PROVIDER) {
    return catalog.providers.find((p) => p.id === CODEX_PROVIDER)?.auth.status === "configured";
  }
  return credentials.some((c) => c.provider === providerId && c.ok);
}

function defaultCustom(catalog: Catalog): RoleSetting {
  const provider = catalog.providers[0]?.id ?? null;
  const modelId = provider ? firstModelId(catalog, provider) : null;
  return { mode: "custom", provider, modelId, thinkingLevel: "off", stale: false };
}

async function saveRole(role: Role, setting: RoleSetting): Promise<RoleSetting> {
  if (setting.mode === "disabled") {
    await api(`/api/settings/ai/roles/${role}`, { method: "DELETE" });
    return { mode: "disabled", provider: null, modelId: null, thinkingLevel: null, stale: false };
  }
  if (setting.mode === "inherit") {
    const res = await api<RoleSettingResponse>(`/api/settings/ai/roles/${role}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "inherit" }),
    });
    return { ...res, stale: false };
  }
  const res = await api<RoleSettingResponse>(`/api/settings/ai/roles/${role}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "custom",
      provider: setting.provider,
      modelId: setting.modelId,
      thinkingLevel: setting.thinkingLevel,
    }),
  });
  return { ...res, stale: false };
}

export function RoleRow({
  role,
  setting,
  catalog,
  credentials,
}: {
  role: Role;
  setting: RoleSetting;
  catalog: Catalog;
  credentials: CredentialEntry[];
}) {
  const [draft, setDraft] = useState(setting);
  const [rolledBack, setRolledBack] = useState(false);
  const [testState, setTestState] = useState<{ status: "idle" | "busy" | "ok" | "fail"; text?: string }>({
    status: "idle",
  });

  const queue = useSaveQueue<RoleSetting>({
    initial: setting,
    save: (snapshot) => saveRole(role, snapshot),
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

  const setMode = (mode: RoleMode) => {
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
    push({ mode: "custom", provider, modelId: firstModelId(catalog, provider), thinkingLevel: "off", stale: false });
  };

  const setModelId = (modelId: string) => {
    push({ ...draft, modelId, thinkingLevel: "off" });
  };

  const setThinkingLevel = (thinkingLevel: string) => {
    push({ ...draft, thinkingLevel });
  };

  const provider = draft.provider ? catalog.providers.find((p) => p.id === draft.provider) : null;
  const models = provider?.models ?? [];
  const model = draft.modelId ? models.find((m) => m.id === draft.modelId) : null;
  const thinkingLevels = model?.thinkingLevels ?? [];
  const computedStale = draft.mode === "custom" && Boolean(draft.modelId) && !model;
  const keyMissing = draft.mode === "custom" && Boolean(draft.provider) && !providerKeyReady(draft.provider!, credentials, catalog);
  const complete = draft.mode === "custom" && Boolean(draft.provider) && Boolean(draft.modelId) && Boolean(draft.thinkingLevel);

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

  const modeOptions: { mode: RoleMode; label: string }[] =
    role === "chat"
      ? [
          { mode: "custom", label: "自定义" },
          { mode: "inherit", label: "跟随升级分析" },
          { mode: "disabled", label: "停用" },
        ]
      : [
          { mode: "custom", label: "启用" },
          { mode: "disabled", label: "停用" },
        ];

  return (
    <div className="settings-role-row">
      <div className="settings-role-head">
        <span className="settings-role-name">{ROLE_LABEL[role]}</span>
        {modeOptions.map((opt) => (
          <Chip key={opt.mode} active={draft.mode === opt.mode} onClick={() => setMode(opt.mode)}>
            {opt.label}
          </Chip>
        ))}
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
            options={thinkingLevels.map((t) => ({ value: t, label: t }))}
            onChange={setThinkingLevel}
          />
          <Button disabled={!complete || testState.status === "busy"} onClick={runTest}>
            测试
          </Button>
          {testState.status === "busy" && <Spinner />}
          {testState.status === "ok" && <span className="settings-test-result settings-test-result--ok">{testState.text}</span>}
          {testState.status === "fail" && <span className="settings-test-result settings-test-result--fail">{testState.text}</span>}
        </div>
      )}

      {computedStale && <div className="settings-role-warning">模型已不在目录，请改选</div>}
      {keyMissing && <div className="settings-role-warning">该 provider 未配 key</div>}
      {draft.mode === "inherit" && <div className="settings-role-warning settings-role-warning--gray">跟随升级分析的模型</div>}
    </div>
  );
}
