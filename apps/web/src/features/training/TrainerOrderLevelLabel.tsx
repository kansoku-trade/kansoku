import {
  useState,
  type FocusEvent as ReactFocusEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import { X } from 'lucide-react';
import { fmt } from '@web/lib/format';
import { colors, fontSizes, fonts, radii } from '../../theme/tokens.stylex';
import { SIZE_PRESETS } from './orderDraft';
import type {
  DraggableKind,
  LevelDismissConfig,
  LevelKind,
  LevelSubmitConfig,
  OffScale,
  OrderLevel,
} from './TrainerOrderLevels';
import type { PinnedPane } from './usePinnedPriceY';

const KIND_LABEL: Record<LevelKind, string> = { target: '目标', entry: '入场', stop: '止损' };
const OFF_SCALE_MARK: Record<'above' | 'below', string> = { above: '▴', below: '▾' };
const OFF_SCALE_HINT = '这个价格已经不在图上，价格牌钉在面板边上，拖它可以把线拉回来';

const styles = stylex.create({
  level: {
    alignItems: 'center',
    display: 'flex',
    height: 0,
    justifyContent: 'flex-end',
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
  },
  levelTarget: { color: colors.up },
  levelStop: { color: colors.down },
  levelEntry: { color: '#4a8cff' },
  levelActive: { zIndex: 1 },
  line: {
    borderTopColor: 'currentColor',
    borderTopStyle: 'dashed',
    borderTopWidth: '1px',
    left: 0,
    opacity: 0.75,
    position: 'absolute',
    right: 0,
  },
  lineFilled: {
    borderTopStyle: 'solid',
    opacity: 1,
  },
  hit: {
    cursor: 'ns-resize',
    height: '9px',
    pointerEvents: 'auto',
    position: 'absolute',
    top: '-4.5px',
  },
  pill: {
    alignItems: 'center',
    backgroundColor: 'rgb(10 10 10 / 0.92)',
    borderColor: 'currentColor',
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    display: 'flex',
    fontSize: fontSizes.sm,
    fontVariantNumeric: 'tabular-nums',
    gap: '6px',
    padding: '2px 4px 2px 8px',
    pointerEvents: 'auto',
    position: 'relative',
    whiteSpace: 'nowrap',
  },
  pillFilled: {
    backgroundColor: 'color-mix(in srgb, currentColor 22%, rgb(10 10 10 / 0.94))',
  },
  pillDrag: {
    cursor: 'ns-resize',
  },
  pillCollapsed: {
    justifyContent: 'flex-end',
    minWidth: '70px',
  },
  pillOffScale: {
    borderStyle: 'dashed',
    opacity: 0.9,
  },
  offScale: {
    fontSize: fontSizes.xs,
    marginRight: '1px',
    opacity: 0.75,
  },
  grip: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  badge: {
    color: colors.textPrimary,
    fontWeight: 600,
  },
  pull: {
    'backgroundColor': 'transparent',
    'borderColor': colors.borderStrong,
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'cursor': 'ns-resize',
    'fontFamily': 'inherit',
    'fontSize': fontSizes.xs,
    'height': '18px',
    'letterSpacing': '0.04em',
    'padding': '0 6px',
    'color': colors.textMuted,
    ':hover': {
      borderColor: colors.textSecondary,
      color: colors.textPrimary,
    },
  },
  pullSetTarget: {
    borderColor: colors.up,
    color: colors.up,
  },
  pullSetStop: {
    borderColor: colors.down,
    color: colors.down,
  },
  price: {
    color: 'currentColor',
    fontFamily: fonts.mono,
  },
  separator: {
    backgroundColor: colors.borderStrong,
    height: '12px',
    width: '1px',
  },
  text: {
    color: 'currentColor',
    fontFamily: fonts.mono,
  },
  was: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
  },
  dim: {
    color: colors.textSecondary,
  },
  blocked: {
    color: colors.down,
    maxWidth: '220px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  action: {
    'backgroundColor': colors.backgroundElement,
    'borderColor': colors.borderStrong,
    'borderRadius': radii.default,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'fontFamily': 'inherit',
    'fontSize': fontSizes.xs,
    'height': '20px',
    'padding': '0 6px',
    ':hover:not(:disabled)': {
      backgroundColor: colors.backgroundHover,
      color: colors.textPrimary,
    },
    ':disabled': {
      cursor: 'default',
      opacity: 0.4,
    },
  },
  actionOk: {
    borderColor: colors.accent,
    color: colors.accent,
  },
  actionGo: {
    borderColor: 'rgb(255 176 0 / 0.55)',
    color: colors.accent,
    minWidth: '34px',
  },
  actionX: {
    display: 'grid',
    padding: 0,
    placeItems: 'center',
    width: '20px',
  },
  submitLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
});

export interface TrainerOrderLevelLabelProps {
  kind: LevelKind;
  level: OrderLevel;
  y: number;
  offScale: OffScale;
  pane: PinnedPane;
  marginRight: number;
  filled: boolean;
  dragging: boolean;
  onGrab?: (event: ReactPointerEvent<HTMLElement>) => void;
  startDrag?: (kind: DraggableKind) => (event: ReactPointerEvent<HTMLElement>) => void;
  onConfirm?: () => void;
  onRevert?: () => void;
  submit?: LevelSubmitConfig;
  dismiss?: LevelDismissConfig;
}

export function TrainerOrderLevelLabel({
  kind,
  level,
  y,
  offScale,
  pane,
  marginRight,
  filled,
  dragging,
  onGrab,
  startDrag,
  onConfirm,
  onRevert,
  submit,
  dismiss,
}: TrainerOrderLevelLabelProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // A settled edit needs its confirm/revert reachable independent of the pointer, which by then has
  // usually left the label entirely — collapsing on top of an unresolved amend would hide the only
  // way to act on it.
  const expanded = hovered || focused || dragging || Boolean(level.pending);

  // Focus can land on the pill itself (the Tab stop that reveals its buttons) or move on into one
  // of those buttons once they exist — only a relatedTarget outside this whole node means focus has
  // actually left the label and it is safe to collapse.
  const handleBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
  };

  return (
    <div
      className={`trainer-level trainer-level--${kind}${filled ? ' trainer-level--filled' : ''}${expanded ? ' trainer-level--active' : ''}${offScale ? ' trainer-level--offscale' : ''} ${stylex.props(styles.level, kind === 'target' ? styles.levelTarget : kind === 'stop' ? styles.levelStop : styles.levelEntry, expanded && styles.levelActive).className}`}
      style={{ top: `${y}px` }}
    >
      {!offScale && (
        <div
          className={`trainer-level-line ${stylex.props(styles.line, filled && styles.lineFilled).className}`}
        />
      )}
      {onGrab && !offScale && (
        // Bounded to the candle pane rather than the overlay: the strip is invisible and
        // pointer-catching, so past the pane's right edge it would eat the price axis's own
        // drag-to-rescale.
        <div
          className={`trainer-level-hit ${stylex.props(styles.hit).className}`}
          style={{ left: `${pane.left}px`, width: `${pane.width}px` }}
          onPointerDown={onGrab}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
        />
      )}
      <div
        className={`trainer-level-pill${onGrab ? ' trainer-level-pill--drag' : ''}${expanded ? '' : ' trainer-level-pill--collapsed'}${offScale ? ' trainer-level-pill--offscale' : ''} ${stylex.props(styles.pill, filled && styles.pillFilled, onGrab && styles.pillDrag, !expanded && styles.pillCollapsed, offScale && styles.pillOffScale).className}`}
        style={{ marginRight: `${marginRight}px` }}
        role="group"
        aria-label={`${KIND_LABEL[kind]} ${fmt(level.price)}${offScale ? ' 超出图表范围' : ''}`}
        title={offScale ? OFF_SCALE_HINT : undefined}
        tabIndex={0}
        onPointerDown={onGrab}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
      >
        {onGrab && (
          <span
            className={`trainer-level-grip ${stylex.props(styles.grip).className}`}
            aria-hidden="true"
          >
            ⇅
          </span>
        )}
        {expanded && level.badge && (
          <span className={`trainer-level-badge ${stylex.props(styles.badge).className}`}>
            {level.badge}
          </span>
        )}
        {expanded &&
          startDrag &&
          level.pulls?.map((pull) => (
            <button
              key={pull.field}
              className={`trainer-level-pull trainer-level-pull--${pull.field}${pull.set ? ' trainer-level-pull--set' : ''} ${stylex.props(styles.pull, pull.set && (pull.field === 'target' ? styles.pullSetTarget : styles.pullSetStop)).className}`}
              aria-label={`拖出${pull.label}`}
              title={pull.set ? `拖动改${pull.label}` : `按住往图上拖，放下就是${pull.label}`}
              onPointerDown={startDrag(pull.field)}
            >
              {pull.label}
            </button>
          ))}
        <span className={`trainer-level-price ${stylex.props(styles.price).className}`}>
          {offScale && (
            <span
              className={`trainer-level-offscale ${stylex.props(styles.offScale).className}`}
              aria-hidden="true"
            >
              {OFF_SCALE_MARK[offScale]}
            </span>
          )}
          {level.pending && (
            <>
              <span className={`trainer-level-was ${stylex.props(styles.was).className}`}>
                {fmt(level.pending.from)}
              </span>
              <span className={`trainer-chip-dim ${stylex.props(styles.dim).className}`}> → </span>
            </>
          )}
          {fmt(level.price)}
        </span>
        {expanded && (
          <>
            <span className={`trainer-level-sep ${stylex.props(styles.separator).className}`} />
            {level.pending ? (
              <>
                {level.pending.note && (
                  <span
                    className={
                      level.pending.blocked
                        ? `trainer-level-blocked ${stylex.props(styles.blocked).className}`
                        : `trainer-chip-dim ${stylex.props(styles.dim).className}`
                    }
                    role={level.pending.blocked ? 'status' : undefined}
                  >
                    {level.pending.note}
                  </span>
                )}
                <button
                  className={`trainer-level-act trainer-level-act--ok ${stylex.props(styles.action, styles.actionOk).className}`}
                  disabled={level.pending.blocked}
                  onClick={onConfirm}
                >
                  确认调整
                </button>
                <button
                  className={`trainer-level-act ${stylex.props(styles.action).className}`}
                  aria-label="撤销调整"
                  onClick={onRevert}
                >
                  撤销
                </button>
              </>
            ) : (
              <span className={`trainer-level-text ${stylex.props(styles.text).className}`}>
                {level.text}
              </span>
            )}
            {kind === 'entry' && submit && (
              <>
                <span className={`trainer-level-sep ${stylex.props(styles.separator).className}`} />
                <span
                  className={`trainer-level-submit-label ${stylex.props(styles.submitLabel).className}`}
                >
                  进场
                </span>
                {SIZE_PRESETS.map(({ label, size }) => (
                  <button
                    key={label}
                    className={`trainer-level-act trainer-level-act--go ${stylex.props(styles.action, styles.actionGo).className}`}
                    aria-label={`${submit.label} ${label}`}
                    disabled={submit.disabled}
                    title={submit.blockedReason ?? `${submit.label} ${label}`}
                    onClick={() => submit.onSubmit(size)}
                  >
                    {label}
                  </button>
                ))}
              </>
            )}
            {kind === 'entry' && dismiss && (
              <button
                className={`trainer-level-act trainer-level-act--x ${stylex.props(styles.action, styles.actionX).className}`}
                aria-label={dismiss.label}
                title={dismiss.label}
                onClick={dismiss.onDismiss}
              >
                <X size={13} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
