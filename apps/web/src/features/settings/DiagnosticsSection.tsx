import { useCallback, useEffect, useState } from 'react';
import { Button, openModal } from '@web/ui';
import { getDesktopLogsBridge } from '../logs/desktopLogs';
import { LogsViewer } from '../logs/LogsPage';
import { SettingsGroup, SettingsRow } from './SettingsGroup';

export function DiagnosticsSection() {
  const [bridge] = useState(() => getDesktopLogsBridge());
  const [path, setPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <SettingsGroup name="诊断日志">
      <SettingsRow label="日志目录" mono={path ?? '加载中…'} error={error ?? undefined}>
        <Button type="button" disabled={busy} onClick={openLogs}>
          查看日志
        </Button>
        <Button type="button" disabled={busy} onClick={() => void reveal()}>
          在访达中显示
        </Button>
      </SettingsRow>
    </SettingsGroup>
  );
}
