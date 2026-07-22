import { useState } from 'react';
import { Button } from '@web/ui';
import type { PendingUpdate } from '@kansoku/core/contract/agentKit';
import type { DesktopAgentKitBridge } from './desktopAgentKit';

export function AgentKitUpdateDialog({
  update,
  bridge,
  onResolved,
  close,
}: {
  update: PendingUpdate;
  bridge: DesktopAgentKitBridge;
  onResolved: () => void;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await bridge.applyUpdate({ dest: update.dest });
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
      <p>{update.dest} 有新版本的模板可用。</p>
      <div className="settings-provider-meta">
        旧模板 hash：{update.oldTemplateHash.slice(0, 12)}
        <br />
        新模板 hash：{update.newTemplateHash.slice(0, 12)}
      </div>
      {error ? (
        <div className="settings-test-result settings-test-result--fail">{error}</div>
      ) : null}
      <div className="settings-cred-actions">
        <Button disabled={busy} onClick={close}>
          继续保留
        </Button>
        <Button accent disabled={busy} onClick={() => void apply()}>
          使用新模板覆盖（备份当前为 .bak.&lt;旧模板 hash&gt;）
        </Button>
      </div>
    </div>
  );
}
