import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@web/ui';
import type { PendingUpdate } from '@kansoku/core/contract/agentKit';
import { colors, fontSizes, fonts } from '../../theme/tokens.stylex';
import type { DesktopAgentKitBridge } from './desktopAgentKit';

const styles = stylex.create({
  providerMeta: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    marginTop: '3px',
    overflowWrap: 'anywhere',
  },
  result: {
    fontSize: fontSizes.sm,
  },
  fail: {
    color: colors.down,
  },
  actions: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'flex-end',
    marginTop: '12px',
  },
});

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
      <div className={`settings-provider-meta ${stylex.props(styles.providerMeta).className}`}>
        旧模板 hash：{update.oldTemplateHash.slice(0, 12)}
        <br />
        新模板 hash：{update.newTemplateHash.slice(0, 12)}
      </div>
      {error ? (
        <div
          className={`settings-test-result settings-test-result--fail ${stylex.props(styles.result, styles.fail).className}`}
        >
          {error}
        </div>
      ) : null}
      <div className={`settings-cred-actions ${stylex.props(styles.actions).className}`}>
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
