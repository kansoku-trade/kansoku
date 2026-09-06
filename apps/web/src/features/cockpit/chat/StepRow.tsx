import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import * as stylex from '@stylexjs/stylex';
import { colors, fonts, fontSizes, radii } from '../../../theme/tokens.stylex';
import { Fold } from '@web/ui';
import { useConversationFold } from './conversationFold.js';

const stepDotPulse = stylex.keyframes({
  '0%, 100%': { opacity: 0.35, transform: 'scale(0.7)' },
  '50%': { opacity: 1, transform: 'scale(1)' },
});

const styles = stylex.create({
  step: {
    'width': '100%',
    'display': 'flex',
    'flexDirection': 'column',
    'gap': 0,
    'padding': '1px 2px',
    'position': 'relative',
    // Each step draws the rail segment *above* itself, so the line survives the block gap the
    // parent owns and no step needs to know whether another one follows it.
    '::before': {
      content: '""',
      position: 'absolute',
      left: '13px',
      top: '-13px',
      height: '13px',
      width: '1px',
      backgroundColor: colors.border,
    },
  },
  head: {
    'gap': '8px',
    'minHeight': '22px',
    'padding': '2px 4px',
    'borderRadius': radii.default,
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'textAlign': 'left',
    ':disabled': {
      cursor: 'default',
    },
    ':not(:disabled):hover': {
      backgroundColor: colors.backgroundSurface,
    },
  },
  gutter: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '14px',
    height: '14px',
  },
  dot: {
    width: '5px',
    height: '5px',
    backgroundColor: colors.up,
    borderRadius: radii.full,
  },
  dotRunning: {
    'backgroundColor': colors.accent,
    'animationName': stepDotPulse,
    'animationDuration': '1.3s',
    'animationTimingFunction': 'ease-in-out',
    'animationIterationCount': 'infinite',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
    },
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    flexGrow: 1,
    flexShrink: 1,
    gap: '8px',
    minWidth: 0,
    overflow: 'hidden',
  },
  title: {
    flexShrink: 0,
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  chip: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    height: '18px',
    padding: '0 6px',
    backgroundColor: colors.backgroundElement,
    borderRadius: radii.full,
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
    fontVariantNumeric: 'tabular-nums',
  },
  gist: {
    minWidth: 0,
    overflow: 'hidden',
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  gistMono: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.xs,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    margin: '2px 0 4px 26px',
    color: colors.textSecondary,
  },
  dotHollow: {
    backgroundColor: 'transparent',
    boxShadow: `inset 0 0 0 1px ${colors.up}`,
  },
  text: {
    margin: '0 0 6px 26px',
    fontSize: fontSizes.sm,
    maxWidth: '66ch',
  },
  textClamped: {
    maxHeight: '4.5em',
    overflow: 'hidden',
    maskImage: 'linear-gradient(to bottom, #000 60%, transparent)',
  },
  more: {
    'alignSelf': 'flex-start',
    'marginTop': '4px',
    'marginLeft': '26px',
    'color': colors.textMuted,
    'fontSize': fontSizes.sm,
    'cursor': 'pointer',
    ':hover': {
      color: colors.textSecondary,
    },
  },
});

export function StepRow({
  foldId,
  className,
  title,
  chips,
  gist,
  monoGist = false,
  detail,
  running = false,
  defaultOpen = false,
  ariaLabel,
}: {
  foldId: string;
  className?: string;
  title: string;
  chips?: readonly string[];
  gist?: string;
  monoGist?: boolean;
  detail?: ReactNode;
  running?: boolean;
  defaultOpen?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useConversationFold(foldId, defaultOpen);
  const hasDetail = Boolean(detail);

  return (
    <Fold
      open={open && hasDetail}
      onToggle={() => setOpen()}
      className={clsx(
        'chat-step',
        running && 'chat-step--running',
        stylex.props(styles.step).className,
        className,
      )}
    >
      <Fold.Trigger
        className={clsx('chat-step-head', stylex.props(styles.head).className)}
        disabled={!hasDetail}
        caret={hasDetail}
        aria-label={ariaLabel ?? `${title}，${running ? '进行中' : '已完成'}`}
      >
        <span className={clsx('chat-step-gutter', stylex.props(styles.gutter).className)} aria-hidden="true">
          <span
            className={clsx(
              'chat-step-dot',
              running && 'running',
              stylex.props(styles.dot, running && styles.dotRunning).className,
            )}
          />
        </span>
        <span className={clsx('chat-step-content', stylex.props(styles.content).className)}>
          <span className={clsx('chat-step-title', stylex.props(styles.title).className)}>
            {title}
          </span>
          {chips?.map((chip) => (
            <span className={clsx('chat-step-chip', stylex.props(styles.chip).className)} key={chip}>
              {chip}
            </span>
          ))}
          {gist ? (
            <span
              className={clsx(
                'chat-step-gist',
                stylex.props(styles.gist, monoGist && styles.gistMono).className,
              )}
            >
              {gist}
            </span>
          ) : null}
        </span>
      </Fold.Trigger>
      {hasDetail ? (
        <Fold.Panel className={clsx('chat-step-body', stylex.props(styles.body).className)}>
          {detail}
        </Fold.Panel>
      ) : null}
    </Fold>
  );
}

export function StepText({
  foldId,
  title = '阶段结论',
  contentKey,
  children,
}: {
  foldId: string;
  title?: string;
  contentKey: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useConversationFold(foldId);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);

  useLayoutEffect(() => {
    if (open) return;
    const el = bodyRef.current;
    if (!el) return;
    setClipped(el.scrollHeight - el.clientHeight > 2);
  }, [contentKey, open]);

  return (
    <div className={clsx('chat-step chat-step--text', stylex.props(styles.step).className)}>
      <div className={clsx('chat-step-head', stylex.props(styles.head).className)}>
        <span className={clsx('chat-step-gutter', stylex.props(styles.gutter).className)} aria-hidden="true">
          <span className={clsx('chat-step-dot', stylex.props(styles.dot, styles.dotHollow).className)} />
        </span>
        <span className={clsx('chat-step-title', stylex.props(styles.title).className)}>{title}</span>
      </div>
      <div
        ref={bodyRef}
        className={clsx('chat-step-text', stylex.props(styles.text, !open && styles.textClamped).className)}
      >
        {children}
      </div>
      {clipped ? (
        <button
          type="button"
          className={clsx('chat-step-more', stylex.props(styles.more).className)}
          onClick={() => setOpen()}
        >
          {open ? '收起' : '展开全部'}
        </button>
      ) : null}
    </div>
  );
}
