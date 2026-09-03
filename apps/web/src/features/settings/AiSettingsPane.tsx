import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { Button, ErrorBox, NoteBlock } from '@web/ui';
import { ProviderCredentialsSection } from './ProviderCredentialsSection';
import { RoleModelsCard } from './RoleModelsCard';
import { SettingsStatusStrip } from './SettingsStatusStrip';
import { deriveSettingsViewModel } from './settingsViewModel';
import { normalizeAiSettings } from './types';
import type {
  AiRoles,
  AiSettings,
  Catalog,
  LobeHubAccount,
  LobeHubCredits,
  PersistedAiSettings,
  Role,
  RoleSetting,
  UsageToday,
} from './types';

const styles = stylex.create({
  loadError: {
    alignItems: 'center',
    display: 'flex',
    gap: '12px',
    justifyContent: 'space-between',
  },
});

function AiSettingsWorkspace({
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
  const updateRoleDraft = (role: Role | 'primary', next: RoleSetting) => {
    setRoleDrafts((current) => ({ ...current, [role]: next }));
  };
  const view = deriveSettingsViewModel({ settings, catalog, usage, roles: roleDrafts });
  const usedProviderIds = Array.from(
    new Set(
      Object.values(roleDrafts).flatMap((setting) =>
        setting.mode === 'custom' && setting.provider ? [setting.provider] : [],
      ),
    ),
  );

  return (
    <>
      <SettingsStatusStrip
        summary={view.summary}
        usageError={usageError}
        onRetryUsage={reloadUsage}
      />
      <RoleModelsCard
        initialRoles={settings.roles}
        roles={roleDrafts}
        catalog={catalog}
        credentials={settings.credentials}
        view={view}
        onDraftChange={updateRoleDraft}
      />
      <ProviderCredentialsSection
        settings={settings}
        catalog={catalog}
        usedProviderIds={usedProviderIds}
        onChanged={reloadAll}
        lobehubAccount={lobehubAccount}
        lobehubCredits={lobehubCredits}
        lobehubCreditsError={lobehubCreditsError}
      />
    </>
  );
}

export function AiSettingsPane() {
  const {
    data: settings,
    error: settingsError,
    reload: reloadSettings,
  } = useQuery<PersistedAiSettings>('settings.getAi', () => client.settings.getAi());
  const {
    data: catalog,
    error: catalogError,
    reload: reloadCatalog,
  } = useQuery<Catalog>('settings.getCatalog', () => client.settings.getCatalog());
  const {
    data: usage,
    error: usageError,
    reload: reloadUsage,
  } = useQuery<UsageToday>('settings.getUsageToday', () => client.settings.getUsageToday());
  const { data: lobehubAccount, reload: reloadLobeHubAccount } = useQuery<LobeHubAccount>(
    'lobehub.getAccount',
    () => client.lobehub.getAccount(),
  );
  const {
    data: lobehubCredits,
    error: lobehubCreditsError,
    reload: reloadLobeHubCredits,
  } = useQuery<LobeHubCredits>('lobehub.getCredits', () => client.lobehub.getCredits());

  if (settingsError || catalogError) {
    return (
      <ErrorBox className={`settings-load-error ${stylex.props(styles.loadError).className}`}>
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
    );
  }

  if (!settings || !catalog) return <NoteBlock>加载中…</NoteBlock>;

  return (
    <AiSettingsWorkspace
      settings={normalizeAiSettings(settings)}
      catalog={catalog}
      usage={usage}
      usageError={usageError}
      reloadUsage={reloadUsage}
      reloadAll={() => {
        reloadSettings();
        reloadCatalog();
        reloadLobeHubAccount();
        reloadLobeHubCredits();
      }}
      lobehubAccount={lobehubAccount}
      lobehubCredits={lobehubCredits}
      lobehubCreditsError={lobehubCreditsError}
    />
  );
}
