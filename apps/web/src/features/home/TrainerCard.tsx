import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { GraduationCap } from 'lucide-react';
import type { TrainerFillState } from '@kansoku/pro-api';
import * as stylex from '@stylexjs/stylex';
import { getTrainerBridge } from '@web/features/desktop/desktopTrainerBridge';
import { getOpenTrainerBridge } from '@web/features/desktop/desktopWindowsBridge';
import { useCapabilities } from '@web/features/edition/capabilitiesStore';
import { requestTrainerWindow } from '@web/features/training/requestTrainerWindow';
import { useTrainerFill } from '@web/features/training/useTrainerFill';
import { Button, Card, SectionTitle } from '@web/ui';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const BASE_PERIOD = '5m';
const REFILL_TARGET = 15;

const styles = stylex.create({
  card: {
    alignItems: 'center',
    display: 'flex',
    gap: '12px',
    justifyContent: 'space-between',
    padding: '10px 12px',
  },
  body: {
    alignItems: 'center',
    display: 'flex',
    gap: '8px',
    minWidth: 0,
  },
  bodyIcon: {
    flex: '0 0 auto',
    opacity: 0.75,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  actions: {
    alignItems: 'center',
    display: 'flex',
    flex: '0 0 auto',
    gap: '6px',
  },
  cancel: {
    'backgroundColor': 'transparent',
    'borderColor': 'transparent',
    'color': colors.textMuted,
    ':hover': {
      color: colors.textPrimary,
    },
  },
  stats: {
    'alignSelf': 'center',
    'color': colors.textSecondary,
    'fontSize': fontSizes.sm,
    'textDecoration': 'none',
    ':hover': {
      color: colors.accent,
    },
  },
});

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
      <Card className={`trainer-card ${stylex.props(styles.card).className}`}>
        <div className={`trainer-card-body ${stylex.props(styles.body).className}`}>
          <GraduationCap {...stylex.props(styles.bodyIcon)} size={18} aria-hidden />
          <span className={`trainer-card-hint ${stylex.props(styles.hint).className}`}>
            {fill.error ?? copy.hint}
          </span>
        </div>
        <div className={`trainer-card-actions ${stylex.props(styles.actions).className}`}>
          <Button disabled={copy.disabled || fill.pending} onClick={copy.onAction}>
            {copy.action}
          </Button>
          {copy.cancel && (
            <Button
              className={`trainer-card-cancel ${stylex.props(styles.cancel).className}`}
              onClick={fill.abortFill}
            >
              取消
            </Button>
          )}
          {licensed && (
            <Link
              className={`trainer-card-stats ${stylex.props(styles.stats).className}`}
              to="/training/stats"
            >
              统计 →
            </Link>
          )}
        </div>
      </Card>
    </>
  );
}
