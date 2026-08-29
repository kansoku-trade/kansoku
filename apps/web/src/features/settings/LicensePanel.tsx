import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { errorMessage } from '@web/lib/api';
import { useQuery } from '@web/lib/apiHooks';
import { refreshCapabilities, useCapabilities } from '@web/features/edition/capabilitiesStore';
import { client } from '@web/lib/client';
import { openLicenseModal } from '@web/features/edition/licenseModalStore';
import { getDesktopAppControlBridge } from './desktopAppControl';
import { Badge, Button, Input, openModal } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  preference: {
    'alignItems': 'center',
    'display': 'flex',
    'gap': '12px',
    'justifyContent': 'space-between',
    'padding': '11px',
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
    fontSize: fontSizes.sm,
    fontWeight: 500,
  },
  preferenceDescription: {
    marginTop: '3px',
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    overflowWrap: 'anywhere',
  },
  testResult: {
    fontSize: fontSizes.sm,
  },
  testResultFail: {
    color: colors.down,
  },
  credActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '6px',
    marginTop: '12px',
  },
  activateRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '8px',
  },
  inputRow: {
    display: 'flex',
    gap: '8px',
  },
  input: {
    minWidth: 0,
    flex: 1,
  },
  invalidNotice: {
    color: colors.down,
  },
  expiredNotice: {
    color: colors.accent,
  },
  restartNotice: {
    color: colors.accent,
  },
  subscribeLink: {
    'alignSelf': 'flex-start',
    'padding': 0,
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'cursor': 'pointer',
    'color': colors.accent,
    'fontSize': fontSizes.sm,
    ':hover': {
      textDecoration: 'underline',
    },
  },
  deactivateButton: {
    flex: '0 0 auto',
    whiteSpace: 'nowrap',
  },
});

function activateErrorMessage(raw: string): string {
  if (/responded (401|404)/.test(raw)) return '授权码无效，请检查后重新输入';
  if (/responded (409|422)/.test(raw)) return '此授权码的设备数已达上限，请先在其他设备停用后再试';
  return `激活失败：${raw}`;
}

function DeactivateConfirm({ closeModal }: { closeModal: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deactivate = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.license.deactivate();
      await refreshCapabilities();
      closeModal();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-reset-confirm">
      <p>停用后本机将失去 AI 功能授权，可随时用授权码重新激活。确定继续吗？</p>
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
        <Button accent disabled={busy} onClick={() => void deactivate()}>
          {busy ? '停用中…' : '确认停用'}
        </Button>
      </div>
    </div>
  );
}

export function useSubscribeInfo() {
  const { data } = useQuery('settings.getSubscribeUrl', () => client.settings.getSubscribeUrl());
  return data ?? null;
}

export function ActivateForm({
  notice,
  showSubscribeLink = true,
  onActivated,
}: {
  notice?: 'invalid' | 'expired';
  showSubscribeLink?: boolean;
  onActivated?: () => void;
}) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscribeData = useSubscribeInfo();

  const activate = async () => {
    const trimmed = key.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await client.license.activate({ key: trimmed });
      if (!result.activated) {
        setError(activateErrorMessage(result.error));
        return;
      }
      const caps = await refreshCapabilities();
      setKey('');
      // When pro doesn't hot-mount (encrypted slot, key just became available),
      // stay put so the caller re-renders into LicensePanel's licensed view,
      // which carries the restart-required notice — closing here would hide it.
      if (caps?.licensed && !caps.pro) return;
      onActivated?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`settings-time-preference ${stylex.props(styles.activateRow).className}`}>
      {notice === 'invalid' ? (
        <div
          className={`settings-preference-description ${stylex.props(styles.invalidNotice).className}`}
        >
          此授权码已失效（可能是退订或更换了套餐），请重新输入有效的授权码。
        </div>
      ) : null}
      {notice === 'expired' ? (
        <div
          className={`settings-preference-description ${stylex.props(styles.expiredNotice).className}`}
        >
          授权过期：超过 14 天未通过服务端验证。网络恢复后自动重验；订阅到期请续订或更换授权码。
        </div>
      ) : null}
      <div className={stylex.props(styles.inputRow).className}>
        <Input
          className={stylex.props(styles.input).className}
          placeholder="输入授权码"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void activate();
          }}
          disabled={busy}
        />
        <Button accent disabled={busy || !key.trim()} onClick={() => void activate()}>
          {busy ? '激活中…' : '激活'}
        </Button>
      </div>
      {error ? (
        <div
          className={`settings-test-result settings-test-result--fail ${stylex.props(styles.testResult, styles.testResultFail).className}`}
        >
          {error}
        </div>
      ) : null}
      {showSubscribeLink && subscribeData?.subscribeUrl ? (
        <button
          type="button"
          className={stylex.props(styles.subscribeLink).className}
          onClick={() => openLicenseModal('guard')}
        >
          还没有授权码？
          {subscribeData.trialDays ? `免费试用 ${subscribeData.trialDays} 天` : '前往订阅'}
        </button>
      ) : null}
    </div>
  );
}

function LicensedStatus({
  state,
  deviceName,
  maskedKey,
  graceUntil,
  restartRequired,
  proUnavailable,
}: {
  state: 'licensed' | 'grace';
  deviceName?: string;
  maskedKey?: string;
  graceUntil?: string;
  restartRequired?: boolean;
  proUnavailable?: boolean;
}) {
  return (
    <div className={`settings-time-preference ${stylex.props(styles.preference).className}`}>
      <div className={`settings-preference-copy ${stylex.props(styles.preferenceCopy).className}`}>
        <div
          className={`settings-preference-name ${stylex.props(styles.preferenceName).className}`}
        >
          {state === 'grace' ? (
            <Badge tone="accent">离线宽限中</Badge>
          ) : (
            <Badge tone="up">已授权</Badge>
          )}
        </div>
        <div
          className={`settings-preference-description ${stylex.props(styles.preferenceDescription).className}`}
        >
          {maskedKey ? `授权码 ${maskedKey}` : null}
          {deviceName ? ` · 设备 ${deviceName}` : null}
          {state === 'grace' && graceUntil
            ? ` · 离线宽限至 ${new Date(graceUntil).toLocaleString()}`
            : null}
        </div>
        {restartRequired ? (
          <div
            className={`settings-preference-description ${stylex.props(styles.restartNotice).className}`}
          >
            {getDesktopAppControlBridge() ? (
              <>
                AI 付费功能需要重启应用后才会生效。
                <Button onClick={() => void getDesktopAppControlBridge()?.relaunch()}>
                  立即重启
                </Button>
              </>
            ) : (
              'AI 付费功能需要重启应用后才会生效，请手动退出并重新打开 Kansoku。'
            )}
          </div>
        ) : null}
        {proUnavailable ? (
          <div
            className={`settings-preference-description ${stylex.props(styles.restartNotice).className}`}
          >
            当前构建不包含付费模块，无法启用 AI 付费功能。
          </div>
        ) : null}
      </div>
      <Button
        className={stylex.props(styles.deactivateButton).className}
        onClick={() =>
          openModal({
            title: '停用本机',
            size: 'sm',
            body: (closeModal) => <DeactivateConfirm closeModal={closeModal} />,
          })
        }
      >
        停用本机
      </Button>
    </div>
  );
}

export function LicensePanel() {
  const { licensed, license, pro, hasEncBundle } = useCapabilities();

  if (licensed) {
    return (
      <LicensedStatus
        state={license?.state === 'grace' ? 'grace' : 'licensed'}
        deviceName={license?.deviceName}
        maskedKey={license?.maskedKey}
        graceUntil={license?.graceUntil}
        restartRequired={!pro && !!hasEncBundle}
        proUnavailable={!pro && !hasEncBundle}
      />
    );
  }

  const notice =
    license?.state === 'invalid' ? 'invalid' : license?.state === 'expired' ? 'expired' : undefined;
  return <ActivateForm notice={notice} />;
}
