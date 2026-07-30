import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { X } from 'lucide-react';
import { fmt } from '@web/lib/format';
import { SIZE_PRESETS } from './orderDraft';
import type {
  LevelDismissConfig,
  LevelKind,
  LevelSubmitConfig,
  OrderLevel,
} from './TrainerOrderLevels';

export interface TrainerOrderLevelLabelProps {
  kind: LevelKind;
  level: OrderLevel;
  y: number;
  marginRight: number;
  filled: boolean;
  dragging: boolean;
  startDrag: (kind: LevelKind) => (event: ReactPointerEvent<HTMLElement>) => void;
  onConfirm?: () => void;
  onRevert?: () => void;
  submit?: LevelSubmitConfig;
  dismiss?: LevelDismissConfig;
}

export function TrainerOrderLevelLabel({
  kind,
  level,
  y,
  marginRight,
  filled,
  dragging,
  startDrag,
  onConfirm,
  onRevert,
  submit,
  dismiss,
}: TrainerOrderLevelLabelProps) {
  const [hovered, setHovered] = useState(false);
  // A settled edit needs its confirm/revert reachable independent of the pointer, which by then has
  // usually left the label entirely — collapsing on top of an unresolved amend would hide the only
  // way to act on it.
  const expanded = hovered || dragging || Boolean(level.pending);

  return (
    <div
      className={`trainer-level trainer-level--${kind}${filled ? ' trainer-level--filled' : ''}${expanded ? ' trainer-level--active' : ''}`}
      style={{ top: `${y}px` }}
    >
      <div className="trainer-level-line" />
      {level.draggable && (
        <div className="trainer-level-hit" onPointerDown={startDrag(kind)} />
      )}
      <div
        className={`trainer-level-pill${level.draggable ? ' trainer-level-pill--drag' : ''}${expanded ? '' : ' trainer-level-pill--collapsed'}`}
        style={{ marginRight: `${marginRight}px` }}
        onPointerDown={level.draggable ? startDrag(kind) : undefined}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        {level.draggable && (
          <span className="trainer-level-grip" aria-hidden="true">
            ⇅
          </span>
        )}
        {expanded && level.badge && <span className="trainer-level-badge">{level.badge}</span>}
        {expanded &&
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
                    className={
                      level.pending.blocked ? 'trainer-level-blocked' : 'trainer-chip-dim'
                    }
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
