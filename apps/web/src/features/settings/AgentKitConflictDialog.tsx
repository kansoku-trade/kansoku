import { useState } from 'react';
import { Button } from '@web/ui';
import type { PendingConflict } from '@kansoku/core/contract/agentKit';
import type { DesktopAgentKitBridge } from './desktopAgentKit';

export function AgentKitConflictDialog({
  conflict,
  bridge,
  onResolved,
  close,
}: {
  conflict: PendingConflict;
  bridge: DesktopAgentKitBridge;
  onResolved: () => void;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolve = async (choice: 'use-template' | 'keep-original') => {
    setBusy(true);
    setError(null);
    try {
      await bridge.resolveConflict({ dest: conflict.dest, choice });
      onResolved();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-reset-confirm">
      <p>目标文件 {conflict.dest} 已经存在但不在 Kit 管理列表里，请选择处理方式：</p>
      {error ? (
        <div className="settings-test-result settings-test-result--fail">{error}</div>
      ) : null}
      <div className="settings-cred-actions">
        <Button disabled={busy} onClick={close}>
          稍后再说
        </Button>
        <Button disabled={busy} onClick={() => void resolve('keep-original')}>
          保留原文件（登记为归用户所有）
        </Button>
        <Button accent disabled={busy} onClick={() => void resolve('use-template')}>
          使用 Kit 模板覆盖（备份原文件为 .bak）
        </Button>
      </div>
    </div>
  );
}
