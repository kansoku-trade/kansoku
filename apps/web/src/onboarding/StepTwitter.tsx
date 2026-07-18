import { useState } from 'react';
import { errorMessage } from '../api';
import { useQuery } from '../apiHooks';
import { client } from '../client';
import type { OpencliStatus } from '../pages/settings/desktopCredentials';
import { Button, Card } from '../ui';

const OPENCLI_INSTALL_COMMAND = 'npm install -g @jackwener/opencli';
const OPENCLI_GITHUB_URL = 'https://github.com/jackwener/opencli';
const OPENCLI_RELEASES_URL = 'https://github.com/jackwener/opencli/releases';

function fetchOpencliStatus(): Promise<OpencliStatus> {
  return client.credentials.opencliStatus() as Promise<OpencliStatus>;
}

export function StepTwitter({ onComplete }: { onComplete: () => Promise<void> }) {
  const { data, loading, reload } = useQuery<OpencliStatus>(
    'onboarding.opencli',
    fetchOpencliStatus,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading || !data) {
    return (
      <Card className="onboarding-card">
        <h1>连接 X/Twitter</h1>
        <p className="onboarding-explainer">正在检测 opencli 环境…</p>
      </Card>
    );
  }

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      await onComplete();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Card className="onboarding-card">
      <h1>连接 X/Twitter</h1>
      <p className="onboarding-explainer">
        AI 分析时会抓取推特上的市场消息；可以先跳过，之后随时在设置里配置。
      </p>

      {data.state === 'not_installed' ? (
        <div className="onboarding-install">
          <pre className="onboarding-cli-command">
            <code>{OPENCLI_INSTALL_COMMAND}</code>
          </pre>
          <div className="settings-cred-actions">
            <Button onClick={() => void navigator.clipboard.writeText(OPENCLI_INSTALL_COMMAND)}>
              复制命令
            </Button>
            <Button
              onClick={() => window.open(OPENCLI_GITHUB_URL, '_blank', 'noopener,noreferrer')}
            >
              GitHub 链接
            </Button>
          </div>
        </div>
      ) : null}

      {data.state === 'extension_missing' ? (
        <div className="onboarding-install">
          <ol className="onboarding-explainer">
            <li>从 GitHub Releases 下载 opencli-extension 压缩包并解压</li>
            <li>在 Chrome 打开 chrome://extensions 并开启开发者模式</li>
            <li>点击「加载已解压的扩展程序」，选择解压后的目录</li>
          </ol>
          <div className="settings-cred-actions">
            <Button
              onClick={() => window.open(OPENCLI_RELEASES_URL, '_blank', 'noopener,noreferrer')}
            >
              下载扩展
            </Button>
          </div>
        </div>
      ) : null}

      {data.state === 'no_session' ? (
        <p className="onboarding-explainer">
          在 Chrome 里登录 x.com 后点「重新检测」（若已登录，刷新一下 x.com 页面再试）。
        </p>
      ) : null}

      {data.state === 'ready' ? (
        <p className="onboarding-explainer">✓ X/Twitter 已连接，AI 分析可引用推特消息面</p>
      ) : null}

      {data.state !== 'ready' && data.lastError ? (
        <div className="settings-test-result settings-test-result--fail">{data.lastError}</div>
      ) : null}
      {error ? (
        <div className="settings-test-result settings-test-result--fail">{error}</div>
      ) : null}

      <div className="settings-cred-actions">
        {data.state === 'ready' ? (
          <Button accent disabled={busy} onClick={finish}>
            完成
          </Button>
        ) : (
          <Button disabled={busy} onClick={reload}>
            重新检测
          </Button>
        )}
      </div>

      <div className="onboarding-skip-row">
        <button className="onboarding-skip-link" disabled={busy} onClick={finish}>
          跳过，稍后在设置里配置
        </button>
      </div>
    </Card>
  );
}
