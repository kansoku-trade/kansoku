import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { GraduationCap } from 'lucide-react';
import type { TrainerFillState } from '@kansoku/pro-api';
import { getTrainerBridge } from '@web/features/desktop/desktopTrainerBridge';
import { getOpenTrainerBridge } from '@web/features/desktop/desktopWindowsBridge';
import { useCapabilities } from '@web/features/edition/capabilitiesStore';
import { requestTrainerWindow } from '@web/features/training/requestTrainerWindow';
import { useTrainerFill } from '@web/features/training/useTrainerFill';
import { Button, Card, SectionTitle } from '@web/ui';

const BASE_PERIOD = '5m';
const REFILL_TARGET = 15;

interface CardCopy {
  hint: string;
  action: string;
  onAction: () => void;
  disabled?: boolean;
  cancel?: boolean;
}

function copyFor(
  fill: TrainerFillState,
  pool: number | null,
  open: () => void,
  refill: () => void,
): CardCopy {
  const task = fill.task;
  if (task?.status === 'running') {
    return {
      hint: `${task.activity} · 已入池 ${task.admitted}`,
      action: '补货中…',
      onAction: () => {},
      disabled: true,
      cancel: true,
    };
  }
  if (pool != null && pool > 0) {
    return { hint: `案例池还有 ${pool} 局`, action: '开一局', onAction: open };
  }
  // The self-suspended state has to be spoken out loud, otherwise the user meets a
  // pool that silently stopped refilling and has nowhere to look.
  if (fill.autoRefillSuspended) {
    return { hint: '连续两次没补到，自动补货已暂停', action: '手动补货', onAction: refill };
  }
  if (task?.status === 'failed') {
    return {
      hint: `上次补货失败：${task.error ?? '未知原因'}`,
      action: '重试补货',
      onAction: refill,
    };
  }
  if (task?.status === 'done' && task.admitted === 0) {
    return { hint: '上次补货没找到合规案例', action: '重试补货', onAction: refill };
  }
  if (pool === null) return { hint: '案例池读取中…', action: '补货', onAction: refill };
  return { hint: '案例池是空的', action: '补货', onAction: refill };
}

export function TrainerCard() {
  const { pro, licensed } = useCapabilities();
  const [pool, setPool] = useState<number | null>(null);
  const ready = pro === true && licensed;
  const fill = useTrainerFill(ready);
  const runningId = fill.state.task?.status === 'running' ? fill.state.task.id : null;

  const reloadPool = useCallback(() => {
    if (!ready) return;
    const bridge = getTrainerBridge();
    if (!bridge) return;
    bridge
      .listPool()
      .then((result) => {
        if (result.ok) setPool(result.data.byBasePeriod[BASE_PERIOD] ?? 0);
      })
      .catch(() => {});
  }, [ready]);

  // Re-read once a refill stops running, so the count reflects what it admitted.
  useEffect(() => {
    reloadPool();
  }, [reloadPool, runningId]);

  const openBridge = getOpenTrainerBridge();
  if (!openBridge || pro !== true) return null;

  const copy = licensed
    ? copyFor(
        fill.state,
        pool,
        () => requestTrainerWindow(openBridge, { pro, licensed }),
        () => fill.startFill(BASE_PERIOD, Math.max(1, REFILL_TARGET - (pool ?? 0))),
      )
    : {
        hint: '订阅后可用',
        action: '了解订阅',
        onAction: () => requestTrainerWindow(openBridge, { pro, licensed }),
      };

  return (
    <>
      <SectionTitle>盲盘训练</SectionTitle>
      <Card className="trainer-card">
        <div className="trainer-card-body">
          <GraduationCap size={18} aria-hidden />
          <span className="trainer-card-hint">{fill.error ?? copy.hint}</span>
        </div>
        <div className="trainer-card-actions">
          <Button disabled={copy.disabled || fill.pending} onClick={copy.onAction}>
            {copy.action}
          </Button>
          {copy.cancel && (
            <Button className="trainer-card-cancel" onClick={fill.abortFill}>
              取消
            </Button>
          )}
          {licensed && (
            <Link className="trainer-card-stats" to="/training/stats">
              统计 →
            </Link>
          )}
        </div>
      </Card>
    </>
  );
}
