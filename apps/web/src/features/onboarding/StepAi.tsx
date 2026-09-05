import { type ReactNode, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { errorMessage } from '../../lib/api';
import { useQuery } from '../../lib/apiHooks';
import { client } from '../../lib/client';
import { DeviceLoginDialog } from '../settings/DeviceLoginDialog';
import { defaultThinkingLevel, firstModelId, saveRole } from '../settings/roleShared';
import { CODEX_PROVIDER, type Catalog, LOBEHUB_PROVIDER } from '../settings/types';
import { Button, Card, Input, openModal, Select } from '../../ui';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';
import { CodexLogo, KeyLogo, LobeHubLogo } from './brandLogos';

const CODEX_INSTALL_COMMAND = 'npm install -g @openai/codex';
const CODEX_INSTALL_URL = 'https://github.com/openai/codex';
const RIPGREP_INSTALL_COMMAND = 'brew install ripgrep';

const styles = stylex.create({
  card: {
    maxWidth: '480px',
    width: '100%',
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
    fontWeight: 600,
    marginBottom: '10px',
  },
  explainer: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 1.6,
    marginBottom: '14px',
  },
  aiList: {
    borderColor: colors.border,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    overflow: 'hidden',
  },
  providerRow: {
    'alignItems': 'center',
    'borderBottomColor': colors.border,
    'borderBottomStyle': 'solid',
    'borderBottomWidth': '1px',
    'display': 'flex',
    'gap': '12px',
    'padding': '12px 14px',
    ':last-child': {
      borderBottomStyle: 'none',
    },
  },
  providerRowRecommended: {
    backgroundColor: 'rgb(250 204 21 / 0.05)',
    boxShadow: `inset 2px 0 0 ${colors.accent}`,
  },
  providerMain: {
    flex: '1 1 auto',
    minWidth: 0,
  },
  providerName: {
    alignItems: 'center',
    display: 'flex',
    fontSize: fontSizes.md,
    fontWeight: 500,
    gap: '8px',
  },
  providerSub: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    marginTop: '2px',
  },
  recommendedTag: {
    borderColor: colors.accent,
    borderRadius: radii.full,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.accent,
    fontSize: fontSizes.xs,
    fontWeight: 600,
    padding: '1px 7px',
  },
  install: {
    marginTop: '12px',
  },
  cliCommand: {
    backgroundColor: colors.backgroundElement,
    borderColor: colors.border,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    margin: '0 0 14px',
    overflowX: 'auto',
    padding: '12px 14px',
  },
  credentialActions: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'flex-end',
    marginTop: '12px',
  },
  apiKey: {
    display: 'grid',
    gap: '8px',
    marginTop: '12px',
  },
  apiKeyRow: {
    display: 'grid',
    gap: '8px',
  },
  apiKeyEndpoint: {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
  apiKeyCredentials: {
    gridTemplateColumns: 'minmax(108px, 0.65fr) minmax(0, 1.35fr) auto',
  },
  apiField: {
    minWidth: 0,
    width: '100%',
  },
  apiSubmit: {
    justifyContent: 'center',
    minWidth: '112px',
  },
  testResult: {
    fontSize: fontSizes.sm,
  },
  testResultFail: {
    color: colors.down,
  },
  skipRow: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '14px',
  },
  skipLink: {
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textMuted,
    'cursor': 'pointer',
    'fontSize': fontSizes.sm,
    'padding': 0,
    ':hover:not([disabled])': {
      color: colors.textPrimary,
    },
  },
  skipLinkDisabled: {
    cursor: 'default',
    opacity: 0.5,
  },
});

function fetchCatalog(): Promise<Catalog> {
  return client.settings.getCatalog() as Promise<Catalog>;
}

async function connectPrimary(catalog: Catalog, providerId: string): Promise<void> {
  const modelId = firstModelId(catalog, providerId);
  if (!modelId) throw new Error('该来源暂无可用模型，请稍后在设置里选择');
  const thinkingLevel = defaultThinkingLevel(catalog, providerId, modelId);
  await saveRole('primary', {
    mode: 'custom',
    provider: providerId,
    modelId,
    thinkingLevel,
    stale: false,
  });
}

interface ProviderRow {
  key: string;
  logo: ReactNode;
  name: string;
  tag: string | null;
  sub: string;
  recommended: boolean;
  action: { label: string; accent: boolean; onClick: () => void };
}

export function StepAi({
  ripgrepAvailable,
  onNext,
}: {
  ripgrepAvailable: boolean;
  onNext: () => void;
}) {
  const { data: catalog, loading } = useQuery<Catalog>('onboarding.catalog', fetchCatalog);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiProvider, setApiProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');

  if (loading || !catalog) {
    return (
      <Card className={`onboarding-card ${stylex.props(styles.card).className}`}>
        <h1 className={stylex.props(styles.title).className}>配置 AI</h1>
        <p className={`onboarding-explainer ${stylex.props(styles.explainer).className}`}>
          正在检测本机 AI 环境…
        </p>
      </Card>
    );
  }

  const codexReady =
    catalog.providers.find((p) => p.id === CODEX_PROVIDER)?.auth.status === 'configured';
  const apiProviders = catalog.providers.filter((p) => p.auth.kind === 'api_key');
  const effectiveApiProvider = apiProvider || apiProviders[0]?.id || '';

  const finish = async (tag: string, connect: () => Promise<void>) => {
    setBusy(tag);
    setError(null);
    try {
      await connect();
      onNext();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  };

  const useCodex = () => finish('codex', () => connectPrimary(catalog, CODEX_PROVIDER));
  const skip = () => finish('skip', async () => {});

  const saveApiKey = () =>
    finish('apikey', async () => {
      await client.settings.putCredential({ provider: effectiveApiProvider, key: apiKey });
      await client.settings.putProviderBaseUrl({
        provider: effectiveApiProvider,
        baseUrl: apiBaseUrl,
      });
      await connectPrimary(await fetchCatalog(), effectiveApiProvider);
    });

  const loginLobehub = async () => {
    setBusy('lobehub');
    setError(null);
    try {
      const info = await client.lobehub.startDeviceLogin();
      openModal({
        title: '连接 LobeHub Cloud',
        size: 'sm',
        body: (closeModal) => (
          <DeviceLoginDialog
            login={info}
            closeModal={closeModal}
            onConnected={() => {
              // Connected: refresh the catalog so LobeHub's models exist, wire
              // one to primary, then advance. A model-assign failure still
              // advances — the user just picks a model in settings.
              void (async () => {
                try {
                  await connectPrimary(await fetchCatalog(), LOBEHUB_PROVIDER);
                } catch (err) {
                  console.warn('onboarding: LobeHub connected but model not assigned', err);
                }
                onNext();
              })();
            }}
          />
        ),
      });
      window.open(
        info.verificationUriComplete ?? info.verificationUri,
        '_blank',
        'noopener,noreferrer',
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const codexRow: ProviderRow = {
    key: 'codex',
    logo: <CodexLogo />,
    name: 'codex',
    tag: codexReady ? '已检测 · 推荐' : null,
    sub: codexReady ? '用本机登录态，一键直接用，不额外收费' : '装了 codex 可白嫖本地额度',
    recommended: codexReady,
    action: codexReady
      ? { label: busy === 'codex' ? '配置中…' : '使用', accent: true, onClick: useCodex }
      : { label: '去安装', accent: false, onClick: () => setShowInstall((v) => !v) },
  };
  const lobehubRow: ProviderRow = {
    key: 'lobehub',
    logo: <LobeHubLogo />,
    name: 'LobeHub Cloud',
    tag: codexReady ? null : '推荐',
    sub: codexReady ? '登录即用，云端个人额度' : '登录即用，无需 API Key',
    recommended: !codexReady,
    action: {
      label: busy === 'lobehub' ? '启动中…' : '登录',
      accent: !codexReady,
      onClick: loginLobehub,
    },
  };
  const apiKeyRow: ProviderRow = {
    key: 'apikey',
    logo: <KeyLogo />,
    name: 'API Key',
    tag: null,
    sub: 'openai · anthropic · google',
    recommended: false,
    action: { label: '填入', accent: false, onClick: () => setShowApiKey((v) => !v) },
  };
  const rows = codexReady ? [codexRow, lobehubRow, apiKeyRow] : [lobehubRow, codexRow, apiKeyRow];

  return (
    <Card className={`onboarding-card ${stylex.props(styles.card).className}`}>
      <h1 className={stylex.props(styles.title).className}>配置 AI</h1>
      <p className={`onboarding-explainer ${stylex.props(styles.explainer).className}`}>
        AI 用于盘中快评、升级分析、深度研究和追问。可以先跳过，之后随时在设置里配置。
      </p>

      {!ripgrepAvailable ? (
        <div className={`onboarding-install ${stylex.props(styles.install).className}`}>
          <p className={`onboarding-explainer ${stylex.props(styles.explainer).className}`}>
            未检测到 rg。AI 仍可使用，但无法可靠搜索研究库；安装后重新打开 Kansoku 即可。
          </p>
          <pre className={`onboarding-cli-command ${stylex.props(styles.cliCommand).className}`}>
            <code>{RIPGREP_INSTALL_COMMAND}</code>
          </pre>
        </div>
      ) : null}

      <div {...stylex.props(styles.aiList)}>
        {rows.map((row) => (
          <div
            key={row.key}
            {...stylex.props(styles.providerRow, row.recommended && styles.providerRowRecommended)}
          >
            {row.logo}
            <div {...stylex.props(styles.providerMain)}>
              <div {...stylex.props(styles.providerName)}>
                {row.name}
                {row.tag ? <span {...stylex.props(styles.recommendedTag)}>{row.tag}</span> : null}
              </div>
              <div {...stylex.props(styles.providerSub)}>{row.sub}</div>
            </div>
            <Button
              accent={row.action.accent}
              disabled={busy !== null}
              onClick={row.action.onClick}
            >
              {row.action.label}
            </Button>
          </div>
        ))}
      </div>

      {showInstall ? (
        <div className={`onboarding-install ${stylex.props(styles.install).className}`}>
          <p className={`onboarding-explainer ${stylex.props(styles.explainer).className}`}>
            装好 codex 并登录后，回到这里会自动检测到。
          </p>
          <pre className={`onboarding-cli-command ${stylex.props(styles.cliCommand).className}`}>
            <code>{CODEX_INSTALL_COMMAND}</code>
          </pre>
          <div
            className={`settings-cred-actions ${stylex.props(styles.credentialActions).className}`}
          >
            <Button onClick={() => void navigator.clipboard.writeText(CODEX_INSTALL_COMMAND)}>
              复制命令
            </Button>
            <Button onClick={() => window.open(CODEX_INSTALL_URL, '_blank', 'noopener,noreferrer')}>
              安装文档
            </Button>
          </div>
        </div>
      ) : null}

      {showApiKey && apiProviders.length > 0 ? (
        <div {...stylex.props(styles.apiKey)}>
          <div
            className={`onboarding-apikey-row ${stylex.props(styles.apiKeyRow, styles.apiKeyEndpoint).className}`}
          >
            <Input
              aria-label="Base URL（可选）"
              autoComplete="off"
              className={stylex.props(styles.apiField).className}
              type="url"
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
              placeholder="默认官方地址，可填中转站地址（可选）"
            />
          </div>
          <div
            className={`onboarding-apikey-row ${stylex.props(styles.apiKeyRow, styles.apiKeyCredentials).className}`}
          >
            <Select
              ariaLabel="AI Provider"
              className={stylex.props(styles.apiField).className}
              value={effectiveApiProvider}
              options={apiProviders.map((p) => ({ value: p.id, label: p.name }))}
              onChange={setApiProvider}
            />
            <Input
              autoComplete="off"
              className={stylex.props(styles.apiField).className}
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="API key"
            />
            <Button
              accent
              className={stylex.props(styles.apiSubmit).className}
              disabled={busy !== null || !effectiveApiProvider || !apiKey}
              onClick={saveApiKey}
            >
              {busy === 'apikey' ? '保存中…' : '保存并使用'}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          className={`settings-test-result settings-test-result--fail ${stylex.props(styles.testResult, styles.testResultFail).className}`}
        >
          {error}
        </div>
      ) : null}

      <div className={`onboarding-skip-row ${stylex.props(styles.skipRow).className}`}>
        <button
          className={`onboarding-skip-link ${stylex.props(styles.skipLink, busy !== null && styles.skipLinkDisabled).className}`}
          disabled={busy !== null}
          onClick={skip}
        >
          跳过，稍后在设置里配置
        </button>
      </div>
    </Card>
  );
}
