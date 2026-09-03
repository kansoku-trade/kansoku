import { useEffect, useState } from 'react';
import { getTrainerBridge } from '@web/features/desktop/desktopTrainerBridge';
import { useCapabilities } from '@web/features/edition/capabilitiesStore';
import { Switch } from '@web/ui';
import { SettingsGroup, SettingsRow } from './SettingsGroup';

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
    <SettingsGroup name="盲盘训练">
      <SettingsRow
        label="自动补货"
        description="池容低于 5 局自动补至 15 局；连续补空两次后暂停挂起，手动补一次恢复"
      >
        <Switch ariaLabel="自动补货" checked={enabled} onCheckedChange={toggle} />
      </SettingsRow>
    </SettingsGroup>
  );
}
