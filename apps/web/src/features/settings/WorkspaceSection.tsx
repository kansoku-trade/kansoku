import { useCallback, useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Badge, Button } from '@web/ui';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';
import { getDesktopWorkspaceBridge, type WorkspaceStatus } from './desktopWorkspace';
import { SettingsConnectionSection } from './SettingsConnectionSection';

const styles = stylex.create({
  section: { padding: '10px 11px' },
  title: {
    alignItems: 'center',
    color: colors.textPrimary,
    display: 'flex',
    fontSize: fontSizes.base,
    fontWeight: 600,
    gap: '8px',
    justifyContent: 'space-between',
  },
  path: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    marginTop: '3px',
    overflowWrap: 'anywhere',
  },
  note: {
    color: colors.textSecondary,
    fontSize: fontSizes.control,
    lineHeight: 1.4,
    marginTop: '6px',
  },
  error: { color: colors.down, fontSize: fontSizes.control, marginTop: '6px' },
  actions: { display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '10px' },
});

const MODE_LABEL: Record<WorkspaceStatus['mode'], string> = {
  'local': '本地',
  'dev-repo': '开发仓库',
  'iCloud': 'iCloud',
};

export function WorkspaceSection() {
  const [bridge] = useState(() => getDesktopWorkspaceBridge());
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!bridge) return;
    try {
      setStatus(await bridge.get());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [bridge]);

  useEffect(() => void reload(), [reload]);
  if (!bridge) return null;

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      await bridge.open();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const restoreLocal = async () => {
    if (!window.confirm('确定把 iCloud Workspace 复制回本机吗？iCloud 原文件不会删除。')) return;
    setBusy(true);
    setError(null);
    try {
      await bridge.restoreLocal();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  return (
    <SettingsConnectionSection
      className={`settings-conn-longbridge ${stylex.props(styles.section).className}`}
    >
      <div className={`settings-conn-title ${stylex.props(styles.title).className}`}>
        <span>Agent Workspace</span>
        {status ? (
          <Badge tone={status.mode === 'iCloud' ? 'accent' : undefined}>
            {MODE_LABEL[status.mode]}
          </Badge>
        ) : null}
      </div>
      <div className={`settings-provider-meta ${stylex.props(styles.path).className}`}>
        {status?.path ?? '加载中…'}
      </div>
      <div className={`note-block ${stylex.props(styles.note).className}`}>
        journal、stocks 与 Agent skills 都在这里；可直接把这个目录作为 Codex 或 Claude Code
        项目打开。
      </div>
      {error ? <div {...stylex.props(styles.error)}>{error}</div> : null}
      <div {...stylex.props(styles.actions)}>
        {status?.mode === 'iCloud' ? (
          <Button disabled={busy} onClick={() => void restoreLocal()}>
            恢复到本机…
          </Button>
        ) : null}
        <Button disabled={busy || !status} onClick={() => void open()}>
          在 Finder 中显示
        </Button>
      </div>
    </SettingsConnectionSection>
  );
}
