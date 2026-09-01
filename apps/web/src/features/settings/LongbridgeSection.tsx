import { useState } from 'react';
import type { LongbridgeRegionPreference } from '@kansoku/core/contract/settings';
import * as stylex from '@stylexjs/stylex';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { Badge, Button, SegmentedControl, type SegmentedControlOption } from '@web/ui';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';
import { getDesktopCredentialsBridge, type CredentialsGetResult } from './desktopCredentials';
import { SettingsConnectionSection } from './SettingsConnectionSection';

const INSTALL_URL = 'https://open.longbridge.com/docs/cli/install';

const REGION_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'com', label: '国际站 .com' },
  { value: 'cn', label: '境内站 .cn' },
] satisfies readonly SegmentedControlOption<LongbridgeRegionPreference>[];

const styles = stylex.create({
  section: {
    padding: '10px 11px',
  },
  title: {
    alignItems: 'center',
    color: colors.textPrimary,
    display: 'flex',
    fontSize: fontSizes.base,
    fontWeight: 600,
    gap: '8px',
    justifyContent: 'space-between',
  },
  timePreference: {
    'alignItems': 'center',
    'display': 'flex',
    'gap': '12px',
    'justifyContent': 'flex-start',
    'padding': '11px 0 0',
    '@media (max-width: 560px)': {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
  },
  preferenceCopy: {
    minWidth: 0,
  },
  preferenceName: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: 500,
  },
  testResult: {
    fontSize: fontSizes.control,
  },
  testResultFail: {
    color: colors.down,
  },
  providerMeta: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    marginTop: '3px',
    overflowWrap: 'anywhere',
  },
  credActions: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'flex-end',
    marginTop: '12px',
  },
});

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
    ? 'CLI 已连接'
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
    <SettingsConnectionSection className={stylex.props(styles.section).className}>
      <div {...stylex.props(styles.title)}>
        <span>Longbridge CLI</span>
        <Badge tone={ready ? 'up' : 'down'}>{label}</Badge>
      </div>
      {data?.cliPath && (
        <div className={`settings-provider-meta ${stylex.props(styles.providerMeta).className}`}>
          {data.cliPath}
        </div>
      )}
      {data?.lastError && (
        <div
          className={`settings-test-result settings-test-result--fail ${
            stylex.props(styles.testResult, styles.testResultFail).className
          }`}
        >
          {data.lastError}
        </div>
      )}
      <div className={`settings-cred-actions ${stylex.props(styles.credActions).className}`}>
        <Button onClick={() => window.open(INSTALL_URL, '_blank', 'noopener,noreferrer')}>
          安装说明
        </Button>
        <Button onClick={reload}>重新检测</Button>
      </div>
      {region.data && (
        <div
          className={`settings-time-preference ${stylex.props(styles.timePreference).className}`}
        >
          <div
            className={`settings-preference-copy ${stylex.props(styles.preferenceCopy).className}`}
          >
            <div
              className={`settings-preference-name ${
                stylex.props(styles.preferenceName).className
              }`}
            >
              线路
            </div>
          </div>
          <SegmentedControl
            ariaLabel="长桥线路"
            fit
            disabled={regionBusy}
            value={region.data.region}
            options={REGION_OPTIONS}
            onChange={(next) => void handleRegionChange(next)}
          />
          <div className={`settings-provider-meta ${stylex.props(styles.providerMeta).className}`}>
            自动模式探测可达线路；修改后下次连接生效
          </div>
        </div>
      )}
      {regionError && (
        <div
          className={`settings-test-result settings-test-result--fail ${
            stylex.props(styles.testResult, styles.testResultFail).className
          }`}
        >
          {regionError}
        </div>
      )}
    </SettingsConnectionSection>
  );
}
