import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "../../apiHooks";
import { client } from "../../client";
import { navigate } from "../../router";
import { Button, Card, ErrorBox, SectionTitle } from "../../ui";
import { useTitle } from "../../useTitle";
import { DataRootSection } from "./DataRootSection";
import { DiagnosticsSection } from "./DiagnosticsSection";
import { LicenseSection } from "./LicenseSection";
import { LongbridgeSection } from "./LongbridgeSection";
import { ProviderCredentialsSection } from "./ProviderCredentialsSection";
import { RoleModelsCard } from "./RoleModelsCard";
import { SettingsStatusStrip } from "./SettingsStatusStrip";
import { TimeDisplaySettingsCard } from "./TimeDisplaySettingsCard";
import { WatchedMarketsCard } from "./WatchedMarketsCard";
import { deriveSettingsViewModel } from "./settingsViewModel";
import type {
  AiRoles,
  AiSettings,
  Catalog,
  LobeHubAccount,
  LobeHubCredits,
  Role,
  RoleSetting,
  UsageToday,
} from "./types";

function SettingsWorkspace({
  settings,
  catalog,
  usage,
  usageError,
  reloadUsage,
  reloadAll,
  lobehubAccount,
  lobehubCredits,
  lobehubCreditsError,
}: {
  settings: AiSettings;
  catalog: Catalog;
  usage: UsageToday | null;
  usageError: string | null;
  reloadUsage: () => void;
  reloadAll: () => void;
  lobehubAccount: LobeHubAccount | null;
  lobehubCredits: LobeHubCredits | null;
  lobehubCreditsError: string | null;
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
        <div className="settings-main-column">
          <RoleModelsCard
            initialRoles={settings.roles}
            roles={roleDrafts}
            catalog={catalog}
            credentials={settings.credentials}
            view={view}
            onDraftChange={updateRoleDraft}
          />
          <Card className="settings-provider-card">
            <ProviderCredentialsSection
              settings={settings}
              catalog={catalog}
              usedProviderIds={usedProviderIds}
              onChanged={reloadAll}
              lobehubAccount={lobehubAccount}
              lobehubCredits={lobehubCredits}
              lobehubCreditsError={lobehubCreditsError}
            />
          </Card>
        </div>
        <div className="settings-side-column">
          <LicenseSection />
          <TimeDisplaySettingsCard />
          <WatchedMarketsCard />
          <Card className="settings-connections-card">
            <div className="settings-card-heading">
              <SectionTitle>连接</SectionTitle>
            </div>
            <LongbridgeSection />
            <DataRootSection />
            <DiagnosticsSection />
          </Card>
        </div>
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
  const { data: lobehubAccount, reload: reloadLobeHubAccount } = useQuery<LobeHubAccount>(
    "lobehub.getAccount",
    () => client.lobehub.getAccount(),
  );
  const {
    data: lobehubCredits,
    error: lobehubCreditsError,
    reload: reloadLobeHubCredits,
  } = useQuery<LobeHubCredits>("lobehub.getCredits", () => client.lobehub.getCredits());

  const reloadAll = () => {
    reloadSettings();
    reloadCatalog();
    reloadLobeHubAccount();
    reloadLobeHubCredits();
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
      <div className="settings-page-subtitle">显示、AI 模型、Provider 与用量</div>
      <SettingsWorkspace
        settings={settings}
        catalog={catalog}
        usage={usage}
        usageError={usageError}
        reloadUsage={reloadUsage}
        reloadAll={reloadAll}
        lobehubAccount={lobehubAccount}
        lobehubCredits={lobehubCredits}
        lobehubCreditsError={lobehubCreditsError}
      />
      <div className="settings-about-link">
        <a href="/about">关于 Kansoku · 版本 {__APP_VERSION__}</a>
      </div>
    </div>
  );
}
