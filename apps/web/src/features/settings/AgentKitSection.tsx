import { useCallback, useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, openModal, Switch } from '@web/ui';
import { AgentKitConflictDialog } from './AgentKitConflictDialog';
import { AgentKitUpdateDialog } from './AgentKitUpdateDialog';
import { SettingsField, SettingsGroup, SettingsRow } from './SettingsGroup';
import { openSettingsConfirm } from './openSettingsConfirm';
import {
  getDesktopAgentKitBridge,
  type AgentKitStatus,
  type PendingConflict,
  type PendingUpdate,
} from './desktopAgentKit';

const styles = stylex.create({
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  spacer: {
    flex: 1,
  },
});

function locationLabel(status: AgentKitStatus): string {
  if (status.location.kind === 'custom') return status.location.path;
  return `Agent Workspace · ${status.dataRoot}`;
}

export function AgentKitSection() {
  const [bridge] = useState(() => getDesktopAgentKitBridge());
  const [status, setStatus] = useState<AgentKitStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!bridge) return;
    try {
      const next = await bridge.getStatus();
      setStatus(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [bridge]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!bridge) return null;

  const withBusy = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (enabled: boolean) => void withBusy(() => bridge.setEnabled({ enabled }));
  const follow = () => void withBusy(() => bridge.followDataRoot());
  const pick = () => void withBusy(() => bridge.pickCustomLocation());
  const forceSync = () => void withBusy(() => bridge.forceSync());
  const clean = () =>
    openSettingsConfirm({
      title: '清理 Agent Kit',
      message: '这会删除本地生成的引导文件、skills 软链接与 kansoku-cli 入口。',
      confirmLabel: '确认清理',
      danger: true,
      onConfirm: () => void withBusy(() => bridge.clean()),
    });

  const openConflict = (conflict: PendingConflict) =>
    openModal({
      title: <>处理冲突 · {conflict.dest}</>,
      size: 'sm',
      body: (close) => (
        <AgentKitConflictDialog
          conflict={conflict}
          bridge={bridge}
          onResolved={reload}
          close={close}
        />
      ),
    });

  const openUpdate = (update: PendingUpdate) =>
    openModal({
      title: <>新模板可用 · {update.dest}</>,
      size: 'sm',
      body: (close) => (
        <AgentKitUpdateDialog update={update} bridge={bridge} onResolved={reload} close={close} />
      ),
    });

  const canSync = Boolean(status?.enabled && status?.resolvedPath);

  return (
    <SettingsGroup name="Agent Kit">
      <SettingsRow
        label="启用"
        description="为外部 Claude Code / Codex 提供内置 skills 软链接与 kansoku-cli 入口"
        error={error ?? undefined}
      >
        <Switch
          ariaLabel="启用 Agent Kit"
          checked={status?.enabled ?? false}
          disabled={busy || !status}
          onCheckedChange={(checked) => toggle(checked)}
        />
      </SettingsRow>
      <SettingsRow
        label="接入位置"
        mono={
          status
            ? `${locationLabel(status)}${status.resolvedPath === null ? '（未生效）' : ''}`
            : '加载中…'
        }
      />
      {status ? (
        <SettingsRow
          label="模板版本"
          mono={`${status.kitVersion ?? '—'} · 上次同步 ${status.lastSyncAt ?? '—'}`}
        />
      ) : null}
      {status?.pendingConflicts?.map((conflict) => (
        <SettingsRow key={conflict.dest} label="冲突待处理" mono={conflict.dest}>
          <Button onClick={() => openConflict(conflict)}>处理</Button>
        </SettingsRow>
      ))}
      {status?.pendingUpdates?.map((update) => (
        <SettingsRow key={update.dest} label="新模板可用" mono={update.dest}>
          <Button onClick={() => openUpdate(update)}>查看</Button>
        </SettingsRow>
      ))}
      <SettingsField label="操作">
        <div {...stylex.props(styles.actions)}>
          <Button disabled={busy || status?.location.kind === 'follow-data-root'} onClick={follow}>
            使用 Agent Workspace
          </Button>
          <Button disabled={busy} onClick={pick}>
            接入其他项目…
          </Button>
          <span {...stylex.props(styles.spacer)} />
          <Button disabled={busy || !canSync} onClick={forceSync}>
            重刷
          </Button>
          <Button disabled={busy} onClick={clean}>
            清理
          </Button>
        </div>
      </SettingsField>
    </SettingsGroup>
  );
}
