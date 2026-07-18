import { useState } from "react";
import { errorMessage } from "@web/api";
import { client } from "@web/client";
import { Button, Dot, Input, openModal, SectionTitle, Select } from "@web/ui";
import { DeviceLoginDialog } from "./DeviceLoginDialog";
import {
  CODEX_PROVIDER,
  type AiSettings,
  type Catalog,
  type CatalogProvider,
  type CredentialEntry,
  type LobeHubAccount,
  type LobeHubCredits,
  LOBEHUB_PROVIDER,
} from "./types";

const CODEX_STATUS_LABEL: Record<string, string> = {
  configured: "已登录",
  missing: "未登录，终端运行 codex 登录",
  error: "登录态异常",
};

function ResetCredentialsDialog({
  closeModal,
  onChanged,
}: {
  closeModal: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.settings.resetCredentials();
      onChanged();
      closeModal();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-reset-confirm">
      <p>会清空全部已存 key，需重新填写。确定继续吗？</p>
      {error ? <div className="settings-test-result settings-test-result--fail">{error}</div> : null}
      <div className="settings-cred-actions">
        <Button disabled={busy} onClick={closeModal}>
          取消
        </Button>
        <Button accent disabled={busy} onClick={reset}>
          {busy ? "重置中…" : "确认重置"}
        </Button>
      </div>
    </div>
  );
}

function credentialMeta(credential: CredentialEntry | undefined): string {
  if (!credential) return "尚未保存 API key";
  if (!credential.ok) return "已存凭据无法解密";
  return (credential.masked ?? "已保存") + " · 更新于 " + credential.updatedAt.slice(0, 10);
}

function providerState(credential: CredentialEntry | undefined): {
  label: string;
  tone: "up" | "accent" | "muted";
} {
  if (!credential) return { label: "未配置", tone: "muted" };
  if (!credential.ok) return { label: "需重新填写", tone: "accent" };
  return { label: "已保存", tone: "up" };
}

function ProviderAuthRow({
  provider,
  credential,
  editing,
  editKey,
  busy,
  error,
  onStartEdit,
  onEditKey,
  onSave,
  onCancel,
  onDelete,
}: {
  provider: CatalogProvider;
  credential: CredentialEntry | undefined;
  editing: boolean;
  editKey: string;
  busy: boolean;
  error: string | null;
  onStartEdit: () => void;
  onEditKey: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const state = providerState(credential);

  return (
    <div className="settings-provider-row" id={"settings-provider-" + provider.id}>
      <div className="settings-provider-head">
        <span className="settings-provider-name">{provider.name}</span>
        <span className={"settings-provider-state settings-provider-state--" + state.tone}>
          <Dot tone={state.tone === "muted" ? undefined : state.tone} />
          {state.label}
        </span>
      </div>
      <div className="settings-provider-meta">{credentialMeta(credential)}</div>
      {editing ? (
        <div className="settings-provider-editor">
          <Input
            autoComplete="off"
            type="password"
            value={editKey}
            onChange={(event) => onEditKey(event.target.value)}
            placeholder="API key"
          />
          <Button disabled={busy || !editKey} onClick={onSave}>
            {busy ? "保存中…" : "保存"}
          </Button>
          <Button disabled={busy} onClick={onCancel}>
            取消
          </Button>
        </div>
      ) : (
        <div className="settings-provider-actions">
          <Button onClick={onStartEdit}>{credential ? "更新 key" : "添加 key"}</Button>
          {credential ? (
            <Button disabled={busy} onClick={onDelete}>
              {busy ? "删除中…" : "删除"}
            </Button>
          ) : null}
        </div>
      )}
      {error ? (
        <div className="settings-provider-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function CodexAuthRow({ provider }: { provider: CatalogProvider }) {
  const tone =
    provider.auth.status === "configured" ? "up" : provider.auth.status === "error" ? "down" : "accent";

  return (
    <div className="settings-provider-row" id={"settings-provider-" + provider.id}>
      <div className="settings-provider-head">
        <span className="settings-provider-name">{provider.name}</span>
        <span className={"settings-provider-state settings-provider-state--" + tone}>
          <Dot tone={tone} />
          {CODEX_STATUS_LABEL[provider.auth.status]}
        </span>
      </div>
      <div className="settings-provider-meta">使用本机 Codex 登录态，不在此页面保存 key</div>
    </div>
  );
}

const formatUsd = (value: number) => `$${value.toFixed(value < 1 ? 4 : 2)}`;

function LobeHubAuthRow({
  provider,
  account,
  credits,
  creditsError,
  onChanged,
}: {
  provider: CatalogProvider;
  account: LobeHubAccount | null;
  credits: LobeHubCredits | null;
  creditsError: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = account?.status ?? "disconnected";
  const tone = status === "connected" ? "up" : status === "refresh_required" ? "down" : "accent";
  const label =
    status === "connected"
      ? "已连接"
      : status === "refresh_required"
        ? "需要重新登录"
        : status === "unavailable"
          ? "等待 Client ID"
          : "未连接";

  const login = async () => {
    setBusy(true);
    setError(null);
    try {
      const info = await client.lobehub.startDeviceLogin();
      openModal({
        title: "连接 LobeHub Cloud",
        body: (closeModal) => (
          <DeviceLoginDialog login={info} closeModal={closeModal} onConnected={onChanged} />
        ),
      });
      window.open(info.verificationUriComplete ?? info.verificationUri, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.lobehub.deleteSession();
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-provider-row" id={"settings-provider-" + provider.id}>
      <div className="settings-provider-head">
        <span className="settings-provider-name">{provider.name}</span>
        <span className={"settings-provider-state settings-provider-state--" + tone}>
          <Dot tone={tone} />
          {label}
        </span>
      </div>
      {status === "connected" ? (
        <>
          <div className="settings-provider-meta">
            {account?.email ?? account?.name ?? account?.userId ?? "LobeHub Cloud 个人账户"}
            {credits?.plan ? ` · ${credits.plan}` : ""}
          </div>
          <div className="settings-lobehub-credits">
            <span>可用额度 {credits ? formatUsd(credits.availableUsd) : "读取中…"}</span>
            <span>本月使用 {credits ? formatUsd(credits.currentMonthUsd) : creditsError ?? "读取中…"}</span>
            <span>{provider.models.length} 个对话模型</span>
          </div>
        </>
      ) : (
        <div className="settings-provider-meta">
          {status === "unavailable"
            ? "Cloud 开发者 Client 完成后配置 LOBEHUB_OAUTH_CLIENT_ID 即可启用"
            : "使用 Device Flow 登录个人 LobeHub Cloud 账户"}
        </div>
      )}
      <div className="settings-provider-actions">
        {status === "connected" ? (
          <Button disabled={busy} onClick={logout}>{busy ? "退出中…" : "退出登录"}</Button>
        ) : (
          <Button disabled={busy || status === "unavailable"} onClick={login}>
            {busy ? "启动中…" : status === "refresh_required" ? "重新登录" : "登录 LobeHub Cloud"}
          </Button>
        )}
      </div>
      {error ? <div className="settings-provider-error" role="alert">{error}</div> : null}
    </div>
  );
}

export function ProviderCredentialsSection({
  settings,
  catalog,
  usedProviderIds,
  onChanged,
  lobehubAccount,
  lobehubCredits,
  lobehubCreditsError,
}: {
  settings: AiSettings;
  catalog: Catalog;
  usedProviderIds: string[];
  onChanged: () => void;
  lobehubAccount: LobeHubAccount | null;
  lobehubCredits: LobeHubCredits | null;
  lobehubCreditsError: string | null;
}) {
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editKey, setEditKey] = useState("");
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [addProvider, setAddProvider] = useState("");
  const [addKey, setAddKey] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const setProviderError = (provider: string, error: string | null) => {
    setErrors((current) => ({ ...current, [provider]: error }));
  };

  const startEdit = (provider: string) => {
    setEditingProvider(provider);
    setEditKey("");
    setProviderError(provider, null);
  };

  const cancelEdit = (provider: string) => {
    setEditingProvider(null);
    setEditKey("");
    setProviderError(provider, null);
  };

  const saveCredential = async (provider: string) => {
    if (!editKey) return;
    setBusyProvider(provider);
    setProviderError(provider, null);
    try {
      await client.settings.putCredential({ provider, key: editKey });
      setEditingProvider(null);
      setEditKey("");
      onChanged();
    } catch (err) {
      setProviderError(provider, errorMessage(err));
    } finally {
      setBusyProvider(null);
    }
  };

  const addCredential = async (provider: string) => {
    if (!provider || !addKey) return;
    setAddBusy(true);
    setAddError(null);
    try {
      await client.settings.putCredential({ provider, key: addKey });
      setAddProvider("");
      setAddKey("");
      onChanged();
    } catch (err) {
      setAddError(errorMessage(err));
    } finally {
      setAddBusy(false);
    }
  };

  const deleteCredential = async (provider: string) => {
    setBusyProvider(provider);
    setProviderError(provider, null);
    try {
      await client.settings.deleteCredential({ provider });
      onChanged();
    } catch (err) {
      setProviderError(provider, errorMessage(err));
    } finally {
      setBusyProvider(null);
    }
  };

  const handleReset = () => {
    openModal({
      title: "重置全部凭据",
      body: (closeModal) => <ResetCredentialsDialog closeModal={closeModal} onChanged={onChanged} />,
    });
  };

  const credentials = new Map(settings.credentials.map((credential) => [credential.provider, credential]));
  const usedProviders = new Set(usedProviderIds);
  const visibleProviders = catalog.providers.filter(
    (provider) =>
      provider.id === CODEX_PROVIDER ||
      provider.id === LOBEHUB_PROVIDER ||
      credentials.has(provider.id) ||
      usedProviders.has(provider.id),
  );
  const availableToAdd = catalog.providers.filter(
    (provider) =>
      provider.auth.kind === "api_key" &&
      !credentials.has(provider.id) &&
      !usedProviders.has(provider.id),
  );
  const effectiveAddProvider = addProvider || availableToAdd[0]?.id || "";
  const apiKeyCount = settings.credentials.filter(
    (credential) => credential.kind === "api_key" && credential.ok,
  ).length;
  const codex = catalog.providers.find((provider) => provider.id === CODEX_PROVIDER);
  const codexSummary =
    codex?.auth.status === "configured"
      ? "Codex 已登录"
      : codex?.auth.status === "error"
        ? "Codex 登录异常"
        : "Codex 未登录";
  const lobehubSummary =
    lobehubAccount?.status === "connected"
      ? "LobeHub 已连接"
      : lobehubAccount?.status === "unavailable"
        ? "LobeHub 待启用"
        : "LobeHub 未连接";

  return (
    <section id="settings-provider-panel">
      <div className="settings-card-heading">
        <SectionTitle>Provider 与凭据</SectionTitle>
        <span className="settings-conn-summary">
          {apiKeyCount + " 个 key · " + codexSummary + " · " + lobehubSummary}
        </span>
      </div>
      {settings.masterKey === "invalid" ? (
        <div className="settings-warning-strip">
          <span>主密钥异常，已存的凭据无法解密</span>
          <Button onClick={handleReset}>重置全部凭据</Button>
        </div>
      ) : null}
      <div className="settings-provider-list">
        {visibleProviders.map((provider) =>
          provider.id === LOBEHUB_PROVIDER ? (
            <LobeHubAuthRow
              key={provider.id}
              provider={provider}
              account={lobehubAccount}
              credits={lobehubCredits}
              creditsError={lobehubCreditsError}
              onChanged={onChanged}
            />
          ) : provider.id === CODEX_PROVIDER || provider.auth.kind === "oauth" ? (
            <CodexAuthRow key={provider.id} provider={provider} />
          ) : (
            <ProviderAuthRow
              key={provider.id}
              provider={provider}
              credential={credentials.get(provider.id)}
              editing={editingProvider === provider.id}
              editKey={editingProvider === provider.id ? editKey : ""}
              busy={busyProvider === provider.id}
              error={errors[provider.id] ?? null}
              onStartEdit={() => startEdit(provider.id)}
              onEditKey={setEditKey}
              onSave={() => saveCredential(provider.id)}
              onCancel={() => cancelEdit(provider.id)}
              onDelete={() => deleteCredential(provider.id)}
            />
          ),
        )}
        {availableToAdd.length > 0 ? (
          <div className="settings-provider-add">
            <Select
              value={effectiveAddProvider}
              options={availableToAdd.map((provider) => ({ value: provider.id, label: provider.name }))}
              onChange={setAddProvider}
            />
            <Input
              autoComplete="off"
              type="password"
              value={addKey}
              onChange={(event) => setAddKey(event.target.value)}
              placeholder="API key"
            />
            <Button
              disabled={addBusy || !effectiveAddProvider || !addKey}
              onClick={() => addCredential(effectiveAddProvider)}
            >
              {addBusy ? "保存中…" : "添加 Provider"}
            </Button>
            {addError ? (
              <div className="settings-provider-error" role="alert">
                {addError}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
