import {
  useState,
  type FocusEvent as ReactFocusEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { X } from 'lucide-react';
import { fmt } from '@web/lib/format';
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
const OFF_SCALE_HINT = '这个价格已经不在图上，药丸钉在面板边上，拖它可以把线拉回来';

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
      className={`trainer-level trainer-level--${kind}${filled ? ' trainer-level--filled' : ''}${expanded ? ' trainer-level--active' : ''}${offScale ? ' trainer-level--offscale' : ''}`}
      style={{ top: `${y}px` }}
    >
      {!offScale && <div className="trainer-level-line" />}
      {onGrab && !offScale && (
        // Bounded to the candle pane rather than the overlay: the strip is invisible and
        // pointer-catching, so past the pane's right edge it would eat the price axis's own
        // drag-to-rescale.
        <div
          className="trainer-level-hit"
          style={{ left: `${pane.left}px`, width: `${pane.width}px` }}
          onPointerDown={onGrab}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
        />
      )}
      <div
        className={`trainer-level-pill${onGrab ? ' trainer-level-pill--drag' : ''}${expanded ? '' : ' trainer-level-pill--collapsed'}`}
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
          <span className="trainer-level-grip" aria-hidden="true">
            ⇅
          </span>
        )}
        {expanded && level.badge && <span className="trainer-level-badge">{level.badge}</span>}
        {expanded &&
          startDrag &&
          level.pulls?.map((pull) => (
            <button
              key={pull.field}
              className={`trainer-level-pull trainer-level-pull--${pull.field}${pull.set ? ' trainer-level-pull--set' : ''}`}
              aria-label={`拖出${pull.label}`}
              title={pull.set ? `拖动改${pull.label}` : `按住往图上拖，放下就是${pull.label}`}
              onPointerDown={startDrag(pull.field)}
            >
              {pull.label}
            </button>
          ))}
        <span className="trainer-level-price">
          {offScale && (
            <span className="trainer-level-offscale" aria-hidden="true">
              {OFF_SCALE_MARK[offScale]}
            </span>
          )}
          {level.pending && (
            <>
              <span className="trainer-level-was">{fmt(level.pending.from)}</span>
              <span className="trainer-chip-dim"> → </span>
            </>
          )}
          {fmt(level.price)}
        </span>
        {expanded && (
          <>
            <span className="trainer-level-sep" />
            {level.pending ? (
              <>
                {level.pending.note && (
                  <span
                    className={level.pending.blocked ? 'trainer-level-blocked' : 'trainer-chip-dim'}
                    role={level.pending.blocked ? 'status' : undefined}
                  >
                    {level.pending.note}
                  </span>
                )}
                <button
                  className="trainer-level-act trainer-level-act--ok"
                  disabled={level.pending.blocked}
                  onClick={onConfirm}
                >
                  确认调整
                </button>
                <button className="trainer-level-act" aria-label="撤销调整" onClick={onRevert}>
                  撤销
                </button>
              </>
            ) : (
              <span className="trainer-level-text">{level.text}</span>
            )}
            {kind === 'entry' && submit && (
              <>
                <span className="trainer-level-sep" />
                <span className="trainer-level-submit-label">进场</span>
                {SIZE_PRESETS.map(({ label, size }) => (
                  <button
                    key={label}
                    className="trainer-level-act trainer-level-act--go"
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
                className="trainer-level-act trainer-level-act--x"
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
