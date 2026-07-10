import { useQuery } from "../../apiHooks";
import { ErrorBox } from "../../ui";
import { useTitle } from "../../useTitle";
import { CredentialsSettingsCard } from "./CredentialsSettingsCard";
import { ExternalApiCard } from "./ExternalApiCard";
import { ProviderCredentialsCard } from "./ProviderCredentialsCard";
import { RoleModelsCard } from "./RoleModelsCard";
import type { AiSettings, Catalog, UsageToday } from "./types";

export function SettingsPage() {
  useTitle("设置");
  const { data: settings, error: settingsError, reload: reloadSettings } = useQuery<AiSettings>("/api/settings/ai");
  const { data: catalog, error: catalogError, reload: reloadCatalog } = useQuery<Catalog>("/api/settings/ai/catalog");
  const { data: usage } = useQuery<UsageToday>("/api/settings/ai/usage-today");

  const reloadAll = () => {
    reloadSettings();
    reloadCatalog();
  };

  if (settingsError || catalogError) {
    return (
      <div className="page settings-page">
        <h1>设置</h1>
        <ErrorBox>{settingsError ?? catalogError}</ErrorBox>
      </div>
    );
  }

  if (!settings || !catalog) {
    return (
      <div className="page settings-page">
        <h1>设置</h1>
        <div className="note-block">加载中…</div>
      </div>
    );
  }

  return (
    <div className="page settings-page">
      <h1>设置</h1>
      <CredentialsSettingsCard />
      <ProviderCredentialsCard settings={settings} catalog={catalog} onChanged={reloadAll} />
      <RoleModelsCard settings={settings} catalog={catalog} usage={usage ?? null} />
      <ExternalApiCard />
      <div className="settings-footer-note">改动即存即生效；正在进行中的一轮分析仍用旧配置，下一轮起使用新配置。</div>
    </div>
  );
}
