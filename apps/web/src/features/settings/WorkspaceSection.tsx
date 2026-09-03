import { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from '@web/ui';
import { getDesktopWorkspaceBridge, type WorkspaceStatus } from './desktopWorkspace';
import { SettingsGroup, SettingsRow } from './SettingsGroup';
import { openSettingsConfirm } from './openSettingsConfirm';

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
    setBusy(true);
    setError(null);
    try {
      await bridge.restoreLocal();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  const confirmRestoreLocal = () =>
    openSettingsConfirm({
      title: '恢复到本机',
      message: '这会把 iCloud Workspace 复制回本机，iCloud 原文件不会删除。',
      confirmLabel: '确认恢复',
      onConfirm: () => void restoreLocal(),
    });

  return (
    <SettingsGroup
      name="Agent Workspace"
      badge={
        status ? (
          <Badge tone={status.mode === 'iCloud' ? 'accent' : undefined}>
            {MODE_LABEL[status.mode]}
          </Badge>
        ) : null
      }
    >
      <SettingsRow
        label="目录位置"
        mono={status?.path ?? '加载中…'}
        error={error ?? undefined}
      >
        <Button disabled={busy || !status} onClick={() => void open()}>
          在 Finder 中显示
        </Button>
      </SettingsRow>
      <SettingsRow
        label="存放内容"
        description="journal、stocks 与 Agent skills 都在这里，可以直接把这个目录当 Codex 或 Claude Code 项目打开"
      />
      {status?.mode === 'iCloud' ? (
        <SettingsRow
          label="恢复到本机"
          description="把 iCloud Workspace 复制回本机，iCloud 原文件保留"
        >
          <Button disabled={busy} onClick={confirmRestoreLocal}>
            恢复…
          </Button>
        </SettingsRow>
      ) : null}
    </SettingsGroup>
  );
}
