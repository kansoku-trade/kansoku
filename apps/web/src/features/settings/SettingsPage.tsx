import { useState, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { isDesktopRealtime } from '@web/lib/portTransport';
import { navigate } from '@web/lib/router';
import { Button, Card, ErrorBox, NoteBlock, ScrollArea, SectionTitle } from '@web/ui';
import { useTitle } from '@web/lib/useTitle';
import { AgentKitSection } from './AgentKitSection';
import { DataRootSection } from './DataRootSection';
import { DiagnosticsSection } from './DiagnosticsSection';
import { LicenseSection } from './LicenseSection';
import { LongbridgeSection } from './LongbridgeSection';
import { ProviderCredentialsSection } from './ProviderCredentialsSection';
import { TrainingSection } from './TrainingSection';
import { RoleModelsCard } from './RoleModelsCard';
import { SettingsStatusStrip } from './SettingsStatusStrip';
import { TimeDisplaySettingsCard } from './TimeDisplaySettingsCard';
import { WatchedMarketsCard } from './WatchedMarketsCard';
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
import { colors, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  page: {
    'margin': 0,
    'maxWidth': 'none',
    'padding': 0,
    'width': '100%',
    '@media (min-width: 1001px)': {
      height: '100vh',
      minHeight: 0,
      overflow: 'hidden',
    },
  },
  pageDesktop: {
    '@media (min-width: 1001px)': {
      height: 'calc(100vh - 40px)',
    },
  },
  viewport: {
    'height': 'auto',
    '@media (min-width: 1001px)': {
      height: '100%',
    },
  },
  content: {
    'margin': '0 auto',
    'maxWidth': '1180px',
    'padding': '24px 20px 60px',
    'width': '100%',
    '@media (max-width: 560px)': {
      paddingInline: '12px',
    },
  },
  heading: {
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
    fontWeight: 600,
    margin: '0 0 4px',
  },
  backLink: {
    alignItems: 'center',
    color: {
      'default': colors.textSecondary,
      ':hover': colors.textPrimary,
    },
    display: 'inline-flex',
    fontSize: fontSizes.control,
    gap: '4px',
    marginBottom: '8px',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSizes.base,
    marginBottom: '16px',
  },
  loadError: {
    alignItems: 'center',
    display: 'flex',
    gap: '12px',
    justifyContent: 'space-between',
  },
  workspace: {
    'alignItems': 'start',
    'display': 'grid',
    'gap': '12px',
    'gridTemplateColumns': 'minmax(0, 1.15fr) minmax(300px, 1fr)',
    '@media (max-width: 900px)': {
      gridTemplateColumns: '1fr',
    },
  },
  column: {
    display: 'grid',
    gap: '12px',
    minWidth: 0,
  },
  card: {
    marginBottom: 0,
    minWidth: 0,
    overflow: 'hidden',
    padding: 0,
  },
  cardHeading: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    gap: '12px',
    justifyContent: 'space-between',
    minHeight: '34px',
    padding: '0 11px',
  },
  cardHeadingTitle: {
    margin: 0,
  },
  icon: {
    verticalAlign: '-2px',
  },
  aboutLink: {
    fontSize: fontSizes.sm,
    marginTop: '24px',
    textAlign: 'center',
  },
  aboutLinkAnchor: {
    color: {
      'default': colors.textMuted,
      ':hover': colors.textPrimary,
    },
  },
});

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
      <div className={`settings-workspace ${stylex.props(styles.workspace).className}`}>
        <div className={`settings-main-column ${stylex.props(styles.column).className}`}>
          <RoleModelsCard
            initialRoles={settings.roles}
            roles={roleDrafts}
            catalog={catalog}
            credentials={settings.credentials}
            view={view}
            onDraftChange={updateRoleDraft}
          />
          <Card className={`settings-provider-card ${stylex.props(styles.card).className}`}>
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
        <div className={`settings-side-column ${stylex.props(styles.column).className}`}>
          <LicenseSection />
          <TimeDisplaySettingsCard />
          <WatchedMarketsCard />
          <Card className={`settings-connections-card ${stylex.props(styles.card).className}`}>
            <div className={`settings-card-heading ${stylex.props(styles.cardHeading).className}`}>
              <SectionTitle className={stylex.props(styles.cardHeadingTitle).className}>
                连接
              </SectionTitle>
            </div>
            <LongbridgeSection />
            <DataRootSection />
            <AgentKitSection />
            <TrainingSection />
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
      className={`settings-back-link ${stylex.props(styles.backLink).className}`}
      href="/"
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        if (window.history.length > 1) window.history.back();
        else navigate('/');
      }}
    >
      <ArrowLeft className={`icon ${stylex.props(styles.icon).className}`} size={13} /> 返回
    </a>
  );
}

function SettingsPageScrollArea({ children }: { children: ReactNode }) {
  const pageStyle = stylex.props(styles.page, isDesktopRealtime() && styles.pageDesktop);
  return (
    <ScrollArea
      className={`page settings-page ${pageStyle.className}`}
      viewportClassName={`settings-page-viewport ${stylex.props(styles.viewport).className}`}
      contentClassName={`settings-page-content ${stylex.props(styles.content).className}`}
    >
      {children}
    </ScrollArea>
  );
}

export function SettingsPage() {
  useTitle('设置');
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

  const reloadAll = () => {
    reloadSettings();
    reloadCatalog();
    reloadLobeHubAccount();
    reloadLobeHubCredits();
  };

  if (settingsError || catalogError) {
    return (
      <SettingsPageScrollArea>
        <SettingsBackLink />
        <h1 {...stylex.props(styles.heading)}>设置</h1>
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
      </SettingsPageScrollArea>
    );
  }

  if (!settings || !catalog) {
    return (
      <SettingsPageScrollArea>
        <SettingsBackLink />
        <h1 {...stylex.props(styles.heading)}>设置</h1>
        <NoteBlock>加载中…</NoteBlock>
      </SettingsPageScrollArea>
    );
  }

  const normalizedSettings = normalizeAiSettings(settings);

  return (
    <SettingsPageScrollArea>
      <SettingsBackLink />
      <h1 {...stylex.props(styles.heading)}>设置</h1>
      <div className={`settings-page-subtitle ${stylex.props(styles.subtitle).className}`}>
        显示、AI 模型、Provider 与用量
      </div>
      <SettingsWorkspace
        settings={normalizedSettings}
        catalog={catalog}
        usage={usage}
        usageError={usageError}
        reloadUsage={reloadUsage}
        reloadAll={reloadAll}
        lobehubAccount={lobehubAccount}
        lobehubCredits={lobehubCredits}
        lobehubCreditsError={lobehubCreditsError}
      />
      <div className={`settings-about-link ${stylex.props(styles.aboutLink).className}`}>
        <a {...stylex.props(styles.aboutLinkAnchor)} href="/about">
          关于 Kansoku · 版本 {__APP_VERSION__}
        </a>
      </div>
    </SettingsPageScrollArea>
  );
}
