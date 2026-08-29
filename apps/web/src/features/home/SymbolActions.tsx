import { useState } from 'react';
import { Check, Lock, RadioTower } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { trackFeatureUsed } from '@web/lib/analytics';
import { errorMessage } from '@web/lib/api';
import { client } from '@web/lib/client';
import { Button, Switch } from '@web/ui';
import { useFeature } from '@web/features/edition/useFeature';
import { useSymbolFollow } from '@web/features/quotes/useSymbolFollow';
import { colors, fonts, fontSizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  follow: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'inline-flex',
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    gap: '4px',
    marginLeft: 'auto',
    whiteSpace: 'nowrap',
  },
  followActive: {
    color: colors.accent,
  },
  followCompact: {
    marginLeft: 0,
  },
  followError: {
    color: colors.down,
  },
  followIcon: {
    color: colors.borderStrong,
  },
  followIconActive: {
    color: colors.accent,
  },
  followIconError: {
    color: colors.down,
  },
  followLockIcon: {
    color: colors.accent,
  },
  followLocked: {
    'opacity': 0.65,
    ':hover': {
      opacity: 1,
    },
  },
  visuallyHidden: {
    borderStyle: 'none',
    borderWidth: 0,
    clip: 'rect(0, 0, 0, 0)',
    height: '1px',
    margin: '-1px',
    overflow: 'hidden',
    padding: 0,
    position: 'absolute',
    whiteSpace: 'nowrap',
    width: '1px',
  },
  reassess: {
    marginLeft: 'auto',
  },
  reassessIcon: {
    verticalAlign: '-2px',
  },
});

export function FollowToggle({
  symbol,
  initialFollowing,
  compact = false,
}: {
  symbol: string;
  initialFollowing: boolean;
  compact?: boolean;
}) {
  const { state, guard } = useFeature('symbol-follow');
  const { following, busy, statusError, change } = useSymbolFollow({ symbol, initialFollowing });
  const active = following ?? initialFollowing;
  if (state === 'absent') return null;
  const locked = state === 'locked';

  const onControlClick = (event: React.MouseEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if ((event.target as Element).closest('.ui-switch') || busy) return;
    const next = !active;
    if (locked && next) {
      guard(() => {});
      return;
    }
    void change(next);
  };

  return (
    <span
      {...stylex.props(
        styles.follow,
        active && styles.followActive,
        Boolean(statusError) && styles.followError,
        locked && styles.followLocked,
        compact && styles.followCompact,
      )}
      title={
        locked
          ? active
            ? '授权已失效，AI 跟进已暂停；可关闭开关，重新开启需订阅'
            : 'AI 跟进需要有效授权，点击开关订阅解锁'
          : (statusError ?? (active ? 'AI 评论员正在后台持续跟进' : 'AI 评论员未在后台跟进'))
      }
      onClick={onControlClick}
    >
      <RadioTower
        {...stylex.props(
          styles.followIcon,
          active && styles.followIconActive,
          Boolean(statusError) && styles.followIconError,
        )}
        aria-hidden="true"
        size={compact ? 12 : 11}
      />
      <span
        className={compact ? `sr-only ${stylex.props(styles.visuallyHidden).className}` : undefined}
      >
        AI 跟进
      </span>
      {locked && (
        <Lock
          className={`follow-control-lock ${stylex.props(styles.followLockIcon).className}`}
          size={compact ? 12 : 11}
        />
      )}
      <Switch
        ariaLabel={`持续跟进 ${symbol} 的 AI 点评`}
        checked={active}
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

export function ReassessButton({ symbol }: { symbol: string }) {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');

  const run = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (state === 'running') return;
    setState('running');
    try {
      trackFeatureUsed('market_analysis');
      const res = await client.symbols.reassess({ sym: symbol });
      setState(res.started ? 'done' : 'failed');
    } catch (err) {
      console.warn(`reassess ${symbol}: ${errorMessage(err)}`);
      setState('failed');
    }
    window.setTimeout(() => setState('idle'), 4000);
  };

  const labels: Record<typeof state, React.ReactNode> = {
    idle: '重新分析',
    running: '分析中…',
    done: (
      <>
        已触发 <Check className={`icon ${stylex.props(styles.reassessIcon).className}`} size={13} />
      </>
    ),
    failed: '未启动',
  };
  const label = labels[state];
  const btnStates: Record<typeof state, 'busy' | 'done' | 'failed' | undefined> = {
    idle: undefined,
    running: 'busy',
    done: 'done',
    failed: 'failed',
  };
  const btnState = btnStates[state];
  return (
    <Button
      className={stylex.props(styles.reassess).className}
      state={btnState}
      onClick={run}
      disabled={state === 'running'}
    >
      {label}
    </Button>
  );
}
