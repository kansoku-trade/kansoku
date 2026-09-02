import { useCallback, useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, NoteBlock, openModal, Switch } from '@web/ui';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';
import { SettingsConnectionSection } from './SettingsConnectionSection';
import { AgentKitConflictDialog } from './AgentKitConflictDialog';
import { AgentKitUpdateDialog } from './AgentKitUpdateDialog';
import { openSettingsConfirm } from './openSettingsConfirm';
import {
  getDesktopAgentKitBridge,
  type AgentKitStatus,
  type PendingConflict,
  type PendingUpdate,
} from './desktopAgentKit';

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
  summary: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 400,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  providerMeta: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.sm,
    marginTop: '3px',
    overflowWrap: 'anywhere',
  },
  result: {
    color: colors.down,
    fontSize: fontSizes.control,
  },
  pendingRow: {
    alignItems: 'center',
    display: 'flex',
    gap: '8px',
    justifyContent: 'space-between',
    marginTop: '6px',
  },
  actionsBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    justifyContent: 'flex-end',
    marginTop: '10px',
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
    <SettingsConnectionSection
      className={`settings-conn-longbridge ${stylex.props(styles.section).className}`}
    >
      <div className={`settings-conn-title ${stylex.props(styles.title).className}`}>
        <span>Agent Kit</span>
        <Switch
          ariaLabel="启用 Agent Kit"
          checked={status?.enabled ?? false}
          disabled={busy || !status}
          onCheckedChange={(checked) => toggle(checked)}
        />
      </div>

      <div className={`settings-conn-summary ${stylex.props(styles.summary).className}`}>
        为外部 Claude Code / Codex 提供内置 skills 软链接 + kansoku-cli 入口
      </div>

      {status ? (
        <div className={`settings-provider-meta ${stylex.props(styles.providerMeta).className}`}>
          位置：{locationLabel(status)}
          {status.resolvedPath === null ? '（未生效）' : null}
        </div>
      ) : (
        <NoteBlock>加载中…</NoteBlock>
      )}

      {status ? (
        <div className={`settings-provider-meta ${stylex.props(styles.providerMeta).className}`}>
          版本 {status.kitVersion ?? '—'} · 上次同步 {status.lastSyncAt ?? '—'}
        </div>
      ) : null}

      {status?.pendingConflicts?.map((conflict) => (
        <div key={conflict.dest} {...stylex.props(styles.pendingRow)}>
          <span>⚠ 冲突 · {conflict.dest}</span>
          <Button onClick={() => openConflict(conflict)}>处理</Button>
        </div>
      ))}

      {status?.pendingUpdates?.map((update) => (
        <div key={update.dest} {...stylex.props(styles.pendingRow)}>
          <span>ℹ 更新 · {update.dest}</span>
          <Button onClick={() => openUpdate(update)}>查看</Button>
        </div>
      ))}

      {error ? (
        <div
          className={`settings-test-result settings-test-result--fail ${stylex.props(styles.result).className}`}
        >
          {error}
        </div>
      ) : null}

      <div {...stylex.props(styles.actionsBar)}>
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
    </SettingsConnectionSection>
  );
}
