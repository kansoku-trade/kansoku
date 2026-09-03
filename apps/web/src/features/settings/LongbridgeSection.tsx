import { useState } from 'react';
import type { LongbridgeRegionPreference } from '@kansoku/core/contract/settings';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { Badge, Button, SegmentedControl, type SegmentedControlOption } from '@web/ui';
import { getDesktopCredentialsBridge, type CredentialsGetResult } from './desktopCredentials';
import { SettingsGroup, SettingsRow } from './SettingsGroup';

const INSTALL_URL = 'https://open.longbridge.com/docs/cli/install';

const REGION_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'com', label: '国际站 .com' },
  { value: 'cn', label: '境内站 .cn' },
] satisfies readonly SegmentedControlOption<LongbridgeRegionPreference>[];

export function LongbridgeSection() {
  const bridge = getDesktopCredentialsBridge();
  const { data, reload } = useQuery<CredentialsGetResult>(
    bridge ? 'credentials.status' : null,
    () => client.credentials.status() as Promise<CredentialsGetResult>,
  );
  const region = useQuery<{ region: LongbridgeRegionPreference }>(
    bridge ? 'settings.getLongbridgeRegion' : null,
    () => client.settings.getLongbridgeRegion(),
  );
  const [regionBusy, setRegionBusy] = useState(false);
  const [regionError, setRegionError] = useState<string | null>(null);

  if (!bridge) return null;

  const ready = data?.state === 'ready';
  const label = ready
    ? '已连接'
    : data?.state === 'cli_missing'
      ? '未安装 CLI'
      : data?.state === 'login_required'
        ? '需要登录'
        : 'Token 无法读取';

  const handleRegionChange = async (next: LongbridgeRegionPreference) => {
    setRegionBusy(true);
    setRegionError(null);
    try {
      await client.settings.putLongbridgeRegion({ region: next });
      region.reload();
    } catch (err) {
      setRegionError(err instanceof Error ? err.message : String(err));
    } finally {
      setRegionBusy(false);
    }
  };

  return (
    <SettingsGroup name="长桥 CLI" badge={<Badge tone={ready ? 'up' : 'down'}>{label}</Badge>}>
      <SettingsRow
        label="可执行文件"
        mono={data?.cliPath ?? '未找到'}
        error={data?.lastError ?? undefined}
      >
        <Button onClick={reload}>重新检测</Button>
      </SettingsRow>
      {region.data ? (
        <SettingsRow
          label="线路"
          description="自动模式探测可达线路，改完下次连接生效"
          error={regionError ?? undefined}
        >
          <SegmentedControl
            ariaLabel="长桥线路"
            disabled={regionBusy}
            value={region.data.region}
            options={REGION_OPTIONS}
            onChange={(next) => void handleRegionChange(next)}
          />
        </SettingsRow>
      ) : null}
      <SettingsRow label="还没装 CLI？" description="安装后回来点重新检测">
        <Button onClick={() => window.open(INSTALL_URL, '_blank', 'noopener,noreferrer')}>
          安装说明
        </Button>
      </SettingsRow>
    </SettingsGroup>
  );
}
