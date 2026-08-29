import { Lock, RadioTower } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { Switch } from '@web/ui';
import { useFeature } from '@web/features/edition/useFeature';
import { useSymbolFollow } from '@web/features/quotes/useSymbolFollow';
import { colors, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  control: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    whiteSpace: 'nowrap',
  },
  icon: {
    color: colors.accent,
  },
  error: {
    color: colors.down,
  },
  errorIcon: {
    color: colors.down,
  },
  locked: {
    'opacity': 0.65,
    ':hover': {
      opacity: 1,
    },
  },
  lock: {
    color: colors.accent,
  },
});

export function FollowAction({ symbol, revision }: { symbol: string; revision?: string }) {
  const { state } = useFeature('symbol-follow');
  if (state === 'absent') return null;
  return <FollowControl symbol={symbol} revision={revision} locked={state === 'locked'} />;
}

function FollowControl({
  symbol,
  revision,
  locked,
}: {
  symbol: string;
  revision?: string;
  locked: boolean;
}) {
  const { following, busy, statusError, change } = useSymbolFollow({ symbol, revision });
  const { guard } = useFeature('symbol-follow');

  return (
    <span
      className={`follow-control ${stylex.props(styles.control, statusError && styles.error, locked && styles.locked).className}`}
      title={
        locked
          ? following
            ? '授权已失效，AI 跟进已暂停；可关闭开关，重新开启需订阅'
            : 'AI 跟进需要有效授权，点击开关订阅解锁'
          : (statusError ??
            (following
              ? 'AI 评论员会在后台持续跟进；关闭此图表不会停止'
              : 'AI 评论员已停止跟进此标的'))
      }
    >
      <RadioTower {...stylex.props(styles.icon, statusError && styles.errorIcon)} size={13} />
      <span>AI 跟进</span>
      {locked && (
        <Lock className={`follow-control-lock ${stylex.props(styles.lock).className}`} size={11} />
      )}
      <Switch
        ariaLabel="持续跟进 AI 点评"
        checked={following ?? false}
        disabled={busy}
        onCheckedChange={(checked) => {
          if (locked && checked) {
            guard(() => {});
            return;
          }
          void change(checked);
        }}
      />
    </span>
  );
}
