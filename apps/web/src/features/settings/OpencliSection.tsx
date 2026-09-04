import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { Badge, Button } from '@web/ui';
import { getDesktopCredentialsBridge, type OpencliStatus } from './desktopCredentials';
import { SettingsGroup, SettingsRow } from './SettingsGroup';

const INSTALL_COMMAND = 'npm install -g @jackwener/opencli';
const GITHUB_URL = 'https://github.com/jackwener/opencli';
const RELEASES_URL = 'https://github.com/jackwener/opencli/releases';

const LABELS: Record<OpencliStatus['state'], string> = {
  ready: '已连接',
  not_installed: '未安装 CLI',
  extension_missing: '缺少浏览器扩展',
  no_session: '需要登录 x.com',
};

export function OpencliSection() {
  const bridge = getDesktopCredentialsBridge();
  const { data, reload } = useQuery<OpencliStatus>(
    bridge ? 'credentials.opencliStatus' : null,
    () => client.credentials.opencliStatus() as Promise<OpencliStatus>,
  );

  if (!bridge) return null;

  const state = data?.state;
  const ready = state === 'ready';

  return (
    <SettingsGroup
      name="X/Twitter（opencli）"
      badge={<Badge tone={ready ? 'up' : 'down'}>{state ? LABELS[state] : '检测中'}</Badge>}
    >
      <SettingsRow
        label="可执行文件"
        description="AI 分析时用它抓推特上的消息面"
        mono={data?.cliPath ?? '未找到'}
        error={ready ? undefined : (data?.lastError ?? undefined)}
      >
        <Button onClick={reload}>重新检测</Button>
      </SettingsRow>
      {state === 'not_installed' ? (
        <SettingsRow label="安装 CLI" mono={INSTALL_COMMAND}>
          <Button onClick={() => void navigator.clipboard.writeText(INSTALL_COMMAND)}>
            复制命令
          </Button>
          <Button onClick={() => window.open(GITHUB_URL, '_blank', 'noopener,noreferrer')}>
            GitHub
          </Button>
        </SettingsRow>
      ) : null}
      {state === 'extension_missing' ? (
        <SettingsRow
          label="装浏览器扩展"
          description="下载 opencli-extension 并解压，在 chrome://extensions 开启开发者模式后「加载已解压的扩展程序」"
        >
          <Button onClick={() => window.open(RELEASES_URL, '_blank', 'noopener,noreferrer')}>
            下载扩展
          </Button>
        </SettingsRow>
      ) : null}
      {state === 'no_session' ? (
        <SettingsRow
          label="登录 x.com"
          description="在 Chrome 里登录后刷新一下 x.com 页面，再点重新检测"
        />
      ) : null}
    </SettingsGroup>
  );
}
