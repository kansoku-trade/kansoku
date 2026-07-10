import { useQuery } from "../../apiHooks";
import { ErrorBox } from "../../ui";
import { useTitle } from "../../useTitle";
import { ProviderCredentialsCard } from "./ProviderCredentialsCard";
import { RoleModelsCard } from "./RoleModelsCard";
import type { AiSettings, Catalog } from "./types";

export function SettingsPage() {
  useTitle("设置");
  const { data: settings, error: settingsError, reload: reloadSettings } = useQuery<AiSettings>("/api/settings/ai");
  const { data: catalog, error: catalogError } = useQuery<Catalog>("/api/settings/ai/catalog");

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
      <ProviderCredentialsCard settings={settings} catalog={catalog} onChanged={reloadSettings} />
      <RoleModelsCard settings={settings} catalog={catalog} />
      <div className="settings-footer-note">改动即存即生效；正在进行中的一轮分析仍用旧配置，下一轮起使用新配置。</div>
    </div>
  );
}
