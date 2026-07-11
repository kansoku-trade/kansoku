import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "../../apiHooks";
import { client } from "../../client";
import { navigate } from "../../router";
import { Button, ErrorBox } from "../../ui";
import { useTitle } from "../../useTitle";
import { CredentialsSettingsCard } from "./CredentialsSettingsCard";
import { ExternalApiCard } from "./ExternalApiCard";
import { ProviderCredentialsCard } from "./ProviderCredentialsCard";
import { RoleModelsCard } from "./RoleModelsCard";
import { SettingsIssuesPanel } from "./SettingsIssuesPanel";
import { SettingsStatusStrip } from "./SettingsStatusStrip";
import { deriveSettingsViewModel } from "./settingsViewModel";
import type { AiRoles, AiSettings, Catalog, Role, RoleSetting, UsageToday } from "./types";

function SettingsWorkspace({
  settings,
  catalog,
  usage,
  usageError,
  reloadUsage,
  reloadAll,
}: {
  settings: AiSettings;
  catalog: Catalog;
  usage: UsageToday | null;
  usageError: string | null;
  reloadUsage: () => void;
  reloadAll: () => void;
}) {
  const [roleDrafts, setRoleDrafts] = useState<AiRoles>(() => settings.roles);
  const updateRoleDraft = (role: Role | "primary", next: RoleSetting) => {
    setRoleDrafts((current) => ({ ...current, [role]: next }));
  };
  const view = deriveSettingsViewModel({ settings, catalog, usage, roles: roleDrafts });
  const usedProviderIds = Array.from(
    new Set(
      Object.values(roleDrafts).flatMap((setting) =>
        setting.mode === "custom" && setting.provider ? [setting.provider] : [],
      ),
    ),
  );

  return (
    <>
      <SettingsStatusStrip summary={view.summary} usageError={usageError} onRetryUsage={reloadUsage} />
      <div className="settings-workspace">
        <RoleModelsCard
          initialRoles={settings.roles}
          roles={roleDrafts}
          catalog={catalog}
          credentials={settings.credentials}
          view={view}
          onDraftChange={updateRoleDraft}
        />
        <div className="settings-side">
          <CredentialsSettingsCard />
          <ProviderCredentialsCard
            settings={settings}
            catalog={catalog}
            usedProviderIds={usedProviderIds}
            onChanged={reloadAll}
          />
          <SettingsIssuesPanel issues={view.issues} />
          <ExternalApiCard />
        </div>
      </div>
      <div className="settings-footer-note">
        改动即存即生效；正在进行中的一轮分析仍用旧配置，下一轮起使用新配置。
      </div>
    </>
  );
}

function SettingsBackLink() {
  return (
    <a
      className="settings-back-link"
      href="/"
      onClick={(event) => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (window.history.length > 1) window.history.back();
        else navigate("/");
      }}
    >
      <ArrowLeft className="icon" size={13} /> 返回
    </a>
  );
}

export function SettingsPage() {
  useTitle("设置");
  const { data: settings, error: settingsError, reload: reloadSettings } = useQuery<AiSettings>(
    "settings.getAi",
    () => client.settings.getAi(),
  );
  const { data: catalog, error: catalogError, reload: reloadCatalog } = useQuery<Catalog>(
    "settings.getCatalog",
    () => client.settings.getCatalog(),
  );
  const { data: usage, error: usageError, reload: reloadUsage } = useQuery<UsageToday>(
    "settings.getUsageToday",
    () => client.settings.getUsageToday(),
  );

  const reloadAll = () => {
    reloadSettings();
    reloadCatalog();
  };

  if (settingsError || catalogError) {
    return (
      <div className="page settings-page">
        <SettingsBackLink />
        <h1>设置</h1>
        <ErrorBox className="settings-load-error">
          <span>{settingsError ?? catalogError}</span>
          <Button
            onClick={() => {
              reloadSettings();
              reloadCatalog();
            }}
          >
            重试
          </Button>
        </ErrorBox>
      </div>
    );
  }

  if (!settings || !catalog) {
    return (
      <div className="page settings-page">
        <SettingsBackLink />
        <h1>设置</h1>
        <div className="note-block">加载中…</div>
      </div>
    );
  }

  return (
    <div className="page settings-page">
      <SettingsBackLink />
      <h1>设置</h1>
      <div className="settings-page-subtitle">AI 模型、Provider 与用量</div>
      <SettingsWorkspace
        settings={settings}
        catalog={catalog}
        usage={usage}
        usageError={usageError}
        reloadUsage={reloadUsage}
        reloadAll={reloadAll}
      />
    </div>
  );
}
