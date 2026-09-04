import { useState } from 'react';
import type { WebSearchStatus } from '@kansoku/core/contract/settings';
import { WEB_SEARCH_PROVIDERS } from '@kansoku/core/contract/webSearch';
import { errorMessage } from '@web/lib/api';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { isDesktopRealtime } from '@web/lib/portTransport';
import { Badge, Button, Input, Switch } from '@web/ui';
import { SettingsGroup, SettingsRow } from './SettingsGroup';

const CODEX_ROW = 'codex';

export function WebSearchSection() {
  const { data, reload } = useQuery<WebSearchStatus>(
    isDesktopRealtime() ? 'settings.getWebSearch' : null,
    () => client.settings.getWebSearch(),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ row: string; message: string } | null>(null);

  if (!isDesktopRealtime() || !data) return null;

  const statusOf = new Map(data.providers.map((provider) => [provider.id, provider]));

  const act = async (row: string, run: () => Promise<unknown>) => {
    setBusy(row);
    setError(null);
    try {
      await run();
      reload();
    } catch (err) {
      setError({ row, message: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const save = (provider: string) =>
    act(provider, async () => {
      await client.settings.putCredential({ provider, key: draftKey.trim() });
      setEditing(null);
      setDraftKey('');
    });

  return (
    <SettingsGroup
      name="网页搜索"
      badge={
        <Badge tone={data.configured ? 'up' : 'down'}>
          {data.configured ? '已启用' : '未启用'}
        </Badge>
      }
    >
      <SettingsRow
        label="AI 的联网检索后端"
        description={
          data.configured
            ? '按下面的顺序依次尝试，前一个失败才轮到下一个'
            : '一个都没配时，AI 完全不会拿到联网检索工具，只能用长桥数据和本地资料'
        }
      />
      {WEB_SEARCH_PROVIDERS.map((provider) => {
        const status = statusOf.get(provider.id);
        const configured = status?.configured ?? false;
        const isEditing = editing === provider.id;
        return (
          <SettingsRow
            key={provider.id}
            label={provider.label}
            description={provider.note}
            mono={
              configured
                ? status?.fromEnv
                  ? `来自环境变量 ${provider.envVar}`
                  : '已保存 API Key'
                : `未配置 · 或设环境变量 ${provider.envVar}`
            }
            error={error?.row === provider.id ? error.message : undefined}
          >
            {isEditing ? (
              <>
                <Input
                  autoFocus
                  type="password"
                  placeholder="粘贴 API Key"
                  value={draftKey}
                  onChange={(event) => setDraftKey(event.target.value)}
                />
                <Button
                  accent
                  disabled={busy === provider.id || !draftKey.trim()}
                  onClick={() => void save(provider.id)}
                >
                  保存
                </Button>
                <Button
                  onClick={() => {
                    setEditing(null);
                    setDraftKey('');
                  }}
                >
                  取消
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => window.open(provider.signupUrl, '_blank', 'noopener,noreferrer')}
                >
                  申请 Key
                </Button>
                <Button
                  onClick={() => {
                    setEditing(provider.id);
                    setDraftKey('');
                    setError(null);
                  }}
                >
                  {configured ? '更换' : '填入'}
                </Button>
                {configured && !status?.fromEnv ? (
                  <Button
                    disabled={busy === provider.id}
                    onClick={() =>
                      void act(provider.id, () =>
                        client.settings.deleteCredential({ provider: provider.id }),
                      )
                    }
                  >
                    删除
                  </Button>
                ) : null}
              </>
            )}
          </SettingsRow>
        );
      })}
      <SettingsRow
        label="本机 codex CLI"
        description="兜底用。不要 Key，走你自己的 ChatGPT 额度，但一次要几十秒，而且只给整段文字、没有可核对的来源列表"
        mono={data.codex.cliAvailable ? '已检测到 codex' : '未检测到 codex，装了才会生效'}
        error={error?.row === CODEX_ROW ? error.message : undefined}
      >
        <Switch
          ariaLabel="启用 codex CLI 搜索"
          checked={data.codex.enabled}
          disabled={busy === CODEX_ROW}
          onCheckedChange={(next) =>
            void act(CODEX_ROW, () => client.settings.putWebSearchCodex({ enabled: next }))
          }
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
