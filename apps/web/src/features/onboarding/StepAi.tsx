import { type ReactNode, useState } from 'react';
import { errorMessage } from '../../lib/api';
import { useQuery } from '../../lib/apiHooks';
import { client } from '../../lib/client';
import { DeviceLoginDialog } from '../settings/DeviceLoginDialog';
import { defaultThinkingLevel, firstModelId, saveRole } from '../settings/roleShared';
import { CODEX_PROVIDER, type Catalog, LOBEHUB_PROVIDER } from '../settings/types';
import { Button, Card, Input, openModal, Select } from '../../ui';
import { CodexLogo, KeyLogo, LobeHubLogo } from './brandLogos';

const CODEX_INSTALL_COMMAND = 'npm install -g @openai/codex';
const CODEX_INSTALL_URL = 'https://github.com/openai/codex';

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

export function StepAi({ onNext }: { onNext: () => void }) {
  const { data: catalog, loading } = useQuery<Catalog>('onboarding.catalog', fetchCatalog);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiProvider, setApiProvider] = useState('');
  const [apiKey, setApiKey] = useState('');

  if (loading || !catalog) {
    return (
      <Card className="onboarding-card">
        <h1>配置 AI</h1>
        <p className="onboarding-explainer">正在检测本机 AI 环境…</p>
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
      await connectPrimary(await fetchCatalog(), effectiveApiProvider);
    });

  const loginLobehub = async () => {
    setBusy('lobehub');
    setError(null);
    try {
      const info = await client.lobehub.startDeviceLogin();
      openModal({
        title: '连接 LobeHub Cloud',
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
    <Card className="onboarding-card">
      <h1>配置 AI</h1>
      <p className="onboarding-explainer">
        AI 用于盘中快评、升级分析、深度研究和追问。可以先跳过，之后随时在设置里配置。
      </p>

      <div className="onboarding-ai-list">
        {rows.map((row) => (
          <div
            key={row.key}
            className={'onboarding-prow' + (row.recommended ? ' onboarding-prow--rec' : '')}
          >
            {row.logo}
            <div className="onboarding-prow-main">
              <div className="onboarding-prow-name">
                {row.name}
                {row.tag ? <span className="onboarding-rec-tag">{row.tag}</span> : null}
              </div>
              <div className="onboarding-prow-sub">{row.sub}</div>
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
        <div className="onboarding-install">
          <p className="onboarding-explainer">装好 codex 并登录后，回到这里会自动检测到。</p>
          <pre className="onboarding-cli-command">
            <code>{CODEX_INSTALL_COMMAND}</code>
          </pre>
          <div className="settings-cred-actions">
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
        <div className="onboarding-apikey">
          <Select
            value={effectiveApiProvider}
            options={apiProviders.map((p) => ({ value: p.id, label: p.name }))}
            onChange={setApiProvider}
          />
          <Input
            autoComplete="off"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="API key"
          />
          <Button
            accent
            disabled={busy !== null || !effectiveApiProvider || !apiKey}
            onClick={saveApiKey}
          >
            {busy === 'apikey' ? '保存中…' : '保存并使用'}
          </Button>
        </div>
      ) : null}

      {error ? (
        <div className="settings-test-result settings-test-result--fail">{error}</div>
      ) : null}

      <div className="onboarding-skip-row">
        <button className="onboarding-skip-link" disabled={busy !== null} onClick={skip}>
          跳过，稍后在设置里配置
        </button>
      </div>
    </Card>
  );
}
