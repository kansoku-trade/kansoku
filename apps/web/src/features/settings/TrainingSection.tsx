import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { getTrainerBridge } from '@web/features/desktop/desktopTrainerBridge';
import { useCapabilities } from '@web/features/edition/capabilitiesStore';
import { Switch } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';
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
  note: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    lineHeight: 1.6,
    marginTop: '4px',
  },
});

export function TrainingSection() {
  const { pro, licensed } = useCapabilities();
  const available = pro === true && licensed && getTrainerBridge() !== null;
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!available) return;
    const bridge = getTrainerBridge();
    if (!bridge) return;
    let active = true;
    bridge
      .getFill()
      .then((result) => {
        if (active && result.ok) setEnabled(result.data.autoRefillEnabled);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [available]);

  if (!available || enabled === null) return null;

  const toggle = (next: boolean) => {
    setEnabled(next);
    void getTrainerBridge()
      ?.setAutoRefill({ enabled: next })
      .then((result) => {
        if (result.ok) setEnabled(result.data.autoRefillEnabled);
      })
      .catch(() => {});
  };

  return (
    <SettingsConnectionSection className={stylex.props(styles.section).className}>
      <div {...stylex.props(styles.title)}>
        <span>盲盘训练 · 自动补货</span>
        <Switch ariaLabel="自动补货" checked={enabled} onCheckedChange={toggle} />
      </div>
      <div {...stylex.props(styles.note)}>
        池容低于 5 局自动补至 15 局；连续补空两次后暂停挂起，手动补一次恢复
      </div>
    </SettingsConnectionSection>
  );
}
