import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@web/ui';
import type { PendingConflict } from '@kansoku/core/contract/agentKit';
import { colors, fontSizes } from '../../theme/tokens.stylex';
import type { DesktopAgentKitBridge } from './desktopAgentKit';

const styles = stylex.create({
  testResult: {
    fontSize: fontSizes.control,
  },
  testResultFail: {
    color: colors.down,
  },
  credActions: {
    display: 'grid',
    gap: '8px',
    marginTop: '12px',
  },
});

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
        <div
          className={`settings-test-result settings-test-result--fail ${stylex.props(styles.testResult, styles.testResultFail).className}`}
        >
          {error}
        </div>
      ) : null}
      <div className={`settings-cred-actions ${stylex.props(styles.credActions).className}`}>
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
