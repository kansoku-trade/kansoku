import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';
import { Button } from '@web/ui';
import { colors, fonts, radii } from '../../theme/tokens.stylex';
import type { LobeHubDeviceLogin } from './types';

const styles = stylex.create({
  root: {
    display: 'grid',
    gap: '14px',
    minWidth: 'min(420px, 80vw)',
  },
  description: {
    color: colors.textSecondary,
    lineHeight: 1.6,
    margin: 0,
  },
  code: {
    backgroundColor: colors.backgroundDeep,
    borderColor: colors.border,
    borderRadius: radii.lg,
    borderStyle: 'solid',
    borderWidth: '1px',
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: '24px',
    fontWeight: 700,
    letterSpacing: '0.16em',
    padding: '14px 18px',
    textAlign: 'center',
    userSelect: 'all',
  },
});

export function DeviceLoginDialog({
  login,
  closeModal,
  onConnected,
}: {
  login: LobeHubDeviceLogin;
  closeModal: () => void;
  onConnected: () => void;
}) {
  const [status, setStatus] = useState('等待在浏览器中确认…');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const result = await client.lobehub.pollDeviceLogin();
        if (cancelled) return;
        if (result.status === 'connected') {
          onConnected();
          closeModal();
          return;
        }
        if (result.status === 'denied') {
          setStatus('授权已拒绝，请重新发起登录');
          return;
        }
        if (result.status === 'expired') {
          setStatus('验证码已过期，请重新发起登录');
          return;
        }
        timer = setTimeout(poll, result.intervalSeconds * 1000);
      } catch (error) {
        if (!cancelled) setStatus(errorMessage(error));
      }
    };
    timer = setTimeout(poll, login.intervalSeconds * 1000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [closeModal, login.intervalSeconds, onConnected]);

  const url = login.verificationUriComplete ?? login.verificationUri;
  return (
    <div {...stylex.props(styles.root)}>
      <p {...stylex.props(styles.description)}>
        请在 LobeHub Cloud 确认登录，并在需要时输入以下验证码。
      </p>
      <div {...stylex.props(styles.code)}>{login.userCode}</div>
      <div className="settings-provider-meta">{status}</div>
      <div className="settings-cred-actions">
        <Button onClick={() => void navigator.clipboard.writeText(login.userCode)}>
          复制验证码
        </Button>
        <Button accent onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
          打开 LobeHub Cloud
        </Button>
      </div>
    </div>
  );
}
