import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { errorMessage } from '@web/lib/api';
import { money } from '@web/lib/format';
import { client } from '@web/lib/client';
import { Button, Dot, Input, openModal, SectionTitle, Select } from '@web/ui';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';
import { DeviceLoginDialog } from './DeviceLoginDialog';
import { ProviderAuthRow } from './ProviderAuthRow';
import {
  CODEX_PROVIDER,
  type AiSettings,
  type Catalog,
  type CatalogProvider,
  type LobeHubAccount,
  type LobeHubCredits,
  LOBEHUB_PROVIDER,
} from './types';

const CODEX_STATUS_LABEL: Record<string, string> = {
  configured: '已登录',
  missing: '未登录，终端运行 codex 登录',
  error: '登录态异常',
};

const styles = stylex.create({
  testResult: { fontSize: fontSizes.sm },
  testResultFail: { color: colors.down },
  cardHeading: {
    alignItems: 'center',
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    gap: '12px',
    justifyContent: 'space-between',
    minHeight: '34px',
    padding: '0 11px',
  },
  cardTitle: { margin: 0 },
  connSummary: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 400,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  warningStrip: {
    alignItems: 'center',
    backgroundColor: colors.backgroundElement,
    border: `1px solid ${colors.down}`,
    color: colors.down,
    display: 'flex',
    fontSize: fontSizes.sm,
    gap: '10px',
    justifyContent: 'space-between',
    margin: '10px',
    padding: '8px 9px',
  },
  providerRow: {
    borderTop: `1px solid ${colors.border}`,
    padding: '10px 11px',
    ':first-child': {
      borderTopStyle: 'none',
    },
  },
  providerHead: {
    alignItems: 'center',
    display: 'flex',
    gap: '8px',
  },
  providerName: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: 500,
  },
  providerState: {
    alignItems: 'center',
    display: 'inline-flex',
    gap: '5px',
    marginLeft: 'auto',
    fontSize: fontSizes.xs,
    whiteSpace: 'nowrap',
  },
  providerStateUp: { color: colors.up },
  providerStateAccent: { color: colors.accent },
  providerStateDown: { color: colors.down },
  providerMeta: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    marginTop: '3px',
    overflowWrap: 'anywhere',
  },
  lobehubCredits: {
    color: colors.textSecondary,
    display: 'flex',
    flexWrap: 'wrap',
    fontFamily: fonts.mono,
    fontSize: '11px',
    gap: '6px 14px',
  },
  providerActions: {
    alignItems: 'center',
    display: 'flex',
    gap: '6px',
    marginTop: '8px',
  },
  providerError: {
    borderLeft: `2px solid ${colors.down}`,
    color: colors.down,
    fontSize: fontSizes.sm,
    marginTop: '7px',
    overflowWrap: 'anywhere',
    paddingLeft: '7px',
  },
  credActions: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'flex-end',
    marginTop: '12px',
  },
  providerAdd: {
    'alignItems': 'center',
    'borderTop': `1px solid ${colors.border}`,
    'display': 'grid',
    'gap': '6px',
    'gridTemplateColumns': 'minmax(94px, 0.8fr) minmax(120px, 1fr) auto',
    'padding': '10px 11px',
    '@media (max-width: 560px)': { gridTemplateColumns: '1fr' },
  },
  providerAddError: {
    'gridColumn': '1 / -1',
    '@media (max-width: 560px)': { gridColumn: 'auto' },
  },
  providerAddSelect: {
    justifyContent: 'space-between',
  },
  providerAddInput: {
    minWidth: 0,
    width: '100%',
  },
});

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
      {error ? (
        <div
          className={`settings-test-result settings-test-result--fail ${stylex.props(styles.testResult, styles.testResultFail).className}`}
        >
          {error}
        </div>
      ) : null}
      <div className={`settings-cred-actions ${stylex.props(styles.credActions).className}`}>
        <Button disabled={busy} onClick={closeModal}>
          取消
        </Button>
        <Button accent disabled={busy} onClick={reset}>
          {busy ? '重置中…' : '确认重置'}
        </Button>
      </div>
    </div>
  );
}

function CodexAuthRow({ provider }: { provider: CatalogProvider }) {
  const tone =
    provider.auth.status === 'configured'
      ? 'up'
      : provider.auth.status === 'error'
        ? 'down'
        : 'accent';

  return (
    <div
      className={`settings-provider-row ${stylex.props(styles.providerRow).className}`}
      id={'settings-provider-' + provider.id}
    >
      <div className={`settings-provider-head ${stylex.props(styles.providerHead).className}`}>
        <span className={`settings-provider-name ${stylex.props(styles.providerName).className}`}>
          {provider.name}
        </span>
        <span
          className={`settings-provider-state settings-provider-state--${tone} ${
            stylex.props(
              styles.providerState,
              tone === 'up'
                ? styles.providerStateUp
                : tone === 'down'
                  ? styles.providerStateDown
                  : styles.providerStateAccent,
            ).className
          }`}
        >
          <Dot tone={tone} />
          {CODEX_STATUS_LABEL[provider.auth.status]}
        </span>
      </div>
      <div className={`settings-provider-meta ${stylex.props(styles.providerMeta).className}`}>
        使用本机 Codex 登录态，不在此页面保存 key
      </div>
    </div>
  );
}

const formatUsd = (value: number) => money(value, value < 1 ? 4 : 2);

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
  const status = account?.status ?? 'disconnected';
  const tone = status === 'connected' ? 'up' : status === 'refresh_required' ? 'down' : 'accent';
  const label =
    status === 'connected'
      ? '已连接'
      : status === 'refresh_required'
        ? '需要重新登录'
        : status === 'unavailable'
          ? '等待 Client ID'
          : '未连接';

  const login = async () => {
    setBusy(true);
    setError(null);
    try {
      const info = await client.lobehub.startDeviceLogin();
      openModal({
        title: '连接 LobeHub Cloud',
        size: 'sm',
        body: (closeModal) => (
          <DeviceLoginDialog login={info} closeModal={closeModal} onConnected={onChanged} />
        ),
      });
      window.open(
        info.verificationUriComplete ?? info.verificationUri,
        '_blank',
        'noopener,noreferrer',
      );
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
    <div
      className={`settings-provider-row ${stylex.props(styles.providerRow).className}`}
      id={'settings-provider-' + provider.id}
    >
      <div className={`settings-provider-head ${stylex.props(styles.providerHead).className}`}>
        <span className={`settings-provider-name ${stylex.props(styles.providerName).className}`}>
          {provider.name}
        </span>
        <span
          className={`settings-provider-state settings-provider-state--${tone} ${
            stylex.props(
              styles.providerState,
              tone === 'up'
                ? styles.providerStateUp
                : tone === 'down'
                  ? styles.providerStateDown
                  : styles.providerStateAccent,
            ).className
          }`}
        >
          <Dot tone={tone} />
          {label}
        </span>
      </div>
      {status === 'connected' ? (
        <>
          <div className={`settings-provider-meta ${stylex.props(styles.providerMeta).className}`}>
            {account?.email ?? account?.name ?? account?.userId ?? 'LobeHub Cloud 个人账户'}
            {credits?.plan ? ` · ${credits.plan}` : ''}
          </div>
          <div className={stylex.props(styles.lobehubCredits).className}>
            <span>可用额度 {credits ? formatUsd(credits.availableUsd) : '读取中…'}</span>
            <span>
              本月使用 {credits ? formatUsd(credits.currentMonthUsd) : (creditsError ?? '读取中…')}
            </span>
            <span>{provider.models.length} 个对话模型</span>
          </div>
        </>
      ) : (
        <div className={`settings-provider-meta ${stylex.props(styles.providerMeta).className}`}>
          {status === 'unavailable'
            ? 'Cloud 开发者 Client 完成后配置 LOBEHUB_OAUTH_CLIENT_ID 即可启用'
            : '使用 Device Flow 登录个人 LobeHub Cloud 账户'}
        </div>
      )}
      <div
        className={`settings-provider-actions ${stylex.props(styles.providerActions).className}`}
      >
        {status === 'connected' ? (
          <Button disabled={busy} onClick={logout}>
            {busy ? '退出中…' : '退出登录'}
          </Button>
        ) : (
          <Button disabled={busy || status === 'unavailable'} onClick={login}>
            {busy ? '启动中…' : status === 'refresh_required' ? '重新登录' : '登录 LobeHub Cloud'}
          </Button>
        )}
      </div>
      {error ? (
        <div
          className={`settings-provider-error ${stylex.props(styles.providerError).className}`}
          role="alert"
        >
          {error}
        </div>
      ) : null}
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
  const [editKey, setEditKey] = useState('');
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [addProvider, setAddProvider] = useState('');
  const [addKey, setAddKey] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const setProviderError = (provider: string, error: string | null) => {
    setErrors((current) => ({ ...current, [provider]: error }));
  };

  const startEdit = (provider: string) => {
    setEditingProvider(provider);
    setEditKey('');
    setProviderError(provider, null);
  };

  const cancelEdit = (provider: string) => {
    setEditingProvider(null);
    setEditKey('');
    setProviderError(provider, null);
  };

  const saveCredential = async (provider: string) => {
    if (!editKey) return;
    setBusyProvider(provider);
    setProviderError(provider, null);
    try {
      await client.settings.putCredential({ provider, key: editKey });
      setEditingProvider(null);
      setEditKey('');
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
      setAddProvider('');
      setAddKey('');
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
      title: '重置全部凭据',
      size: 'sm',
      body: (closeModal) => (
        <ResetCredentialsDialog closeModal={closeModal} onChanged={onChanged} />
      ),
    });
  };

  const credentials = new Map(
    settings.credentials.map((credential) => [credential.provider, credential]),
  );
  const endpoints = new Map(
    settings.endpoints.map((endpoint) => [endpoint.provider, endpoint.baseUrl]),
  );
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
      provider.auth.kind === 'api_key' &&
      !credentials.has(provider.id) &&
      !usedProviders.has(provider.id),
  );
  const effectiveAddProvider = addProvider || availableToAdd[0]?.id || '';
  const apiKeyCount = settings.credentials.filter(
    (credential) => credential.kind === 'api_key' && credential.ok,
  ).length;
  const codex = catalog.providers.find((provider) => provider.id === CODEX_PROVIDER);
  const codexSummary =
    codex?.auth.status === 'configured'
      ? 'Codex 已登录'
      : codex?.auth.status === 'error'
        ? 'Codex 登录异常'
        : 'Codex 未登录';
  const lobehubSummary =
    lobehubAccount?.status === 'connected'
      ? 'LobeHub 已连接'
      : lobehubAccount?.status === 'unavailable'
        ? 'LobeHub 待启用'
        : 'LobeHub 未连接';

  return (
    <section id="settings-provider-panel">
      <div className={`settings-card-heading ${stylex.props(styles.cardHeading).className}`}>
        <SectionTitle className={stylex.props(styles.cardTitle).className}>
          Provider 与凭据
        </SectionTitle>
        <span className={`settings-conn-summary ${stylex.props(styles.connSummary).className}`}>
          {apiKeyCount + ' 个 key · ' + codexSummary + ' · ' + lobehubSummary}
        </span>
      </div>
      {settings.masterKey === 'invalid' ? (
        <div className={`settings-warning-strip ${stylex.props(styles.warningStrip).className}`}>
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
          ) : provider.id === CODEX_PROVIDER || provider.auth.kind === 'oauth' ? (
            <CodexAuthRow key={provider.id} provider={provider} />
          ) : (
            <ProviderAuthRow
              key={provider.id}
              provider={provider}
              credential={credentials.get(provider.id)}
              baseUrl={endpoints.get(provider.id) ?? null}
              editing={editingProvider === provider.id}
              editKey={editingProvider === provider.id ? editKey : ''}
              busy={busyProvider === provider.id}
              error={errors[provider.id] ?? null}
              onStartEdit={() => startEdit(provider.id)}
              onEditKey={setEditKey}
              onSave={() => saveCredential(provider.id)}
              onCancel={() => cancelEdit(provider.id)}
              onDelete={() => deleteCredential(provider.id)}
              onChanged={onChanged}
            />
          ),
        )}
        {availableToAdd.length > 0 ? (
          <div className={`settings-provider-add ${stylex.props(styles.providerAdd).className}`}>
            <Select
              className={stylex.props(styles.providerAddSelect).className}
              value={effectiveAddProvider}
              options={availableToAdd.map((provider) => ({
                value: provider.id,
                label: provider.name,
              }))}
              onChange={setAddProvider}
            />
            <Input
              className={stylex.props(styles.providerAddInput).className}
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
              {addBusy ? '保存中…' : '添加 Provider'}
            </Button>
            {addError ? (
              <div
                className={`settings-provider-error ${stylex.props(styles.providerError, styles.providerAddError).className}`}
                role="alert"
              >
                {addError}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
