import { useEffect, useState } from 'react';
import { getTrainerBridge } from '@web/features/desktop/desktopTrainerBridge';
import { useCapabilities } from '@web/features/edition/capabilitiesStore';
import { Switch } from '@web/ui';

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
    <section className="settings-conn-section settings-conn-longbridge">
      <div className="settings-conn-title">
        <span>盲盘训练 · 自动补货</span>
        <Switch ariaLabel="自动补货" checked={enabled} onCheckedChange={toggle} />
      </div>
      <div className="settings-conn-note">
        案例池少于 5 局时补到 15
        局。只在读取案例池或打完一局后检查，不定时后台运行；连续两次补不到会自动暂停，手动补一次即恢复。
      </div>
    </section>
  );
}
