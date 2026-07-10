import { useState } from "react";
import { api, errorMessage } from "../../api";
import { Badge, Button, Card, Input, openModal, Select, SectionTitle } from "../../ui";
import { CODEX_PROVIDER, type AiSettings, type Catalog } from "./types";

const CODEX_STATUS_LABEL: Record<string, string> = {
  configured: "已通过 codex 登录",
  missing: "未登录，终端运行 codex 登录",
  error: "登录态异常",
};

function providerName(catalog: Catalog, id: string): string {
  return catalog.providers.find((p) => p.id === id)?.name ?? id;
}

export function ProviderCredentialsCard({
  settings,
  catalog,
  onChanged,
}: {
  settings: AiSettings;
  catalog: Catalog;
  onChanged: () => void;
}) {
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editKey, setEditKey] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [addProvider, setAddProvider] = useState("");
  const [addKey, setAddKey] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [resetBusy, setResetBusy] = useState(false);

  const configured = settings.credentials.filter((c) => c.provider !== CODEX_PROVIDER);
  const configuredIds = new Set(configured.map((c) => c.provider));
  const availableToAdd = catalog.providers.filter(
    (p) => p.auth.kind === "api_key" && !configuredIds.has(p.id),
  );

  const codexAuth = catalog.providers.find((p) => p.id === CODEX_PROVIDER)?.auth;

  const saveCredential = async (provider: string, key: string) => {
    await api(`/api/settings/ai/credentials/${encodeURIComponent(provider)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    });
    onChanged();
  };

  const deleteCredential = async (provider: string) => {
    await api(`/api/settings/ai/credentials/${encodeURIComponent(provider)}`, { method: "DELETE" });
    onChanged();
  };

  const handleUpdate = async (provider: string) => {
    if (!editKey) return;
    setEditBusy(true);
    setEditError(null);
    try {
      await saveCredential(provider, editKey);
      setEditingProvider(null);
      setEditKey("");
    } catch (err) {
      setEditError(errorMessage(err));
    } finally {
      setEditBusy(false);
    }
  };

  const handleAdd = async () => {
    if (!addProvider || !addKey) return;
    setAddBusy(true);
    setAddError(null);
    try {
      await saveCredential(addProvider, addKey);
      setAddProvider("");
      setAddKey("");
    } catch (err) {
      setAddError(errorMessage(err));
    } finally {
      setAddBusy(false);
    }
  };

  const handleReset = () => {
    openModal({
      title: "重置全部凭据",
      body: (closeModal) => (
        <div className="settings-reset-confirm">
          <p>会清空全部已存 key，需重新填写。确定继续吗？</p>
          <div className="settings-cred-actions">
            <Button onClick={closeModal}>取消</Button>
            <Button
              accent
              disabled={resetBusy}
              onClick={async () => {
                setResetBusy(true);
                try {
                  await api("/api/settings/ai/reset-credentials", { method: "POST" });
                  onChanged();
                  closeModal();
                } finally {
                  setResetBusy(false);
                }
              }}
            >
              确认重置
            </Button>
          </div>
        </div>
      ),
    });
  };

  return (
    <Card className="settings-credentials-card">
      <SectionTitle>Provider 与 API key</SectionTitle>
      {settings.masterKey === "invalid" && (
        <div className="settings-warning-strip">
          <span>主密钥异常，已存的凭据无法解密</span>
          <Button onClick={handleReset}>重置全部凭据</Button>
        </div>
      )}
      {configured.map((c) => (
        <div className="settings-cred-row" key={c.provider}>
          <span className="settings-cred-name">{providerName(catalog, c.provider)}</span>
          <span className="settings-cred-meta">
            {c.ok ? c.masked : "需重新填写"} · {c.updatedAt.slice(0, 10)}
          </span>
          {editingProvider === c.provider ? (
            <span className="settings-cred-actions">
              <Input
                type="password"
                value={editKey}
                onChange={(e) => setEditKey(e.target.value)}
                placeholder="新 key"
              />
              <Button accent disabled={editBusy || !editKey} onClick={() => handleUpdate(c.provider)}>
                保存
              </Button>
              <Button
                onClick={() => {
                  setEditingProvider(null);
                  setEditKey("");
                  setEditError(null);
                }}
              >
                取消
              </Button>
            </span>
          ) : (
            <span className="settings-cred-actions">
              <Button
                onClick={() => {
                  setEditingProvider(c.provider);
                  setEditKey("");
                  setEditError(null);
                }}
              >
                更新
              </Button>
              <Button onClick={() => deleteCredential(c.provider)}>删除</Button>
            </span>
          )}
        </div>
      ))}
      {editingProvider && editError && <div className="settings-test-result settings-test-result--fail">{editError}</div>}

      {availableToAdd.length > 0 && (
        <div className="settings-cred-add">
          <Select
            value={addProvider || availableToAdd[0].id}
            options={availableToAdd.map((p) => ({ value: p.id, label: p.name }))}
            onChange={setAddProvider}
          />
          <Input
            type="password"
            value={addKey}
            onChange={(e) => setAddKey(e.target.value)}
            placeholder="API key"
          />
          <Button accent disabled={addBusy || !addKey} onClick={handleAdd}>
            保存
          </Button>
        </div>
      )}
      {addError && <div className="settings-test-result settings-test-result--fail">{addError}</div>}

      <div className="settings-cred-row">
        <span className="settings-cred-name">{providerName(catalog, CODEX_PROVIDER)}</span>
        <Badge tone={codexAuth?.status === "configured" ? "up" : codexAuth?.status === "error" ? "down" : undefined}>
          {CODEX_STATUS_LABEL[codexAuth?.status ?? "missing"]}
        </Badge>
      </div>
    </Card>
  );
}
