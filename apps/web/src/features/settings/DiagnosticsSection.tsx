import { useCallback, useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, openModal } from '@web/ui';
import { getDesktopLogsBridge } from '../logs/desktopLogs';
import { LogsViewer } from '../logs/LogsPage';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';
import { SettingsConnectionSection } from './SettingsConnectionSection';

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
  providerMeta: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    marginTop: '3px',
    overflowWrap: 'anywhere',
  },
  loading: {
    color: colors.textSecondary,
    fontSize: fontSizes.control,
    lineHeight: 1.4,
    marginTop: '6px',
  },
  actions: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'flex-end',
    marginTop: '12px',
  },
  testResult: {
    fontSize: fontSizes.control,
  },
  testResultFail: {
    color: colors.down,
  },
});

export function DiagnosticsSection() {
  const [bridge] = useState(() => getDesktopLogsBridge());
  const [path, setPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!bridge) return;
    try {
      const info = await bridge.getInfo();
      setPath(info.path);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [bridge]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!bridge) return null;

  const reveal = async () => {
    setBusy(true);
    setError(null);
    try {
      await bridge.reveal();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const openLogs = () =>
    openModal({
      title: '诊断日志',
      size: 'lg',
      body: <LogsViewer />,
    });

  return (
    <SettingsConnectionSection
      className={`settings-conn-longbridge ${stylex.props(styles.section).className}`}
    >
      <div className={`settings-conn-title ${stylex.props(styles.title).className}`}>
        <span>诊断 / 日志</span>
      </div>

      {path ? (
        <div
          className={`settings-provider-meta ${stylex.props(styles.providerMeta).className}`}
          title={path}
        >
          {path}
        </div>
      ) : (
        <div className={`note-block ${stylex.props(styles.loading).className}`}>加载中…</div>
      )}

      <div className={`settings-cred-actions ${stylex.props(styles.actions).className}`}>
        <Button type="button" disabled={busy} onClick={openLogs}>
          查看日志
        </Button>
        <Button type="button" disabled={busy} onClick={() => void reveal()}>
          在访达中显示
        </Button>
      </div>

      {error ? (
        <div
          className={`settings-test-result settings-test-result--fail ${stylex.props(styles.testResult, styles.testResultFail).className}`}
        >
          {error}
        </div>
      ) : null}
    </SettingsConnectionSection>
  );
}
