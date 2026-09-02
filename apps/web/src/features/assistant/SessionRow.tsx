import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Ellipsis } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import type { AssistantSessionMeta } from '@kansoku/core/contract/index';
import { Dot, TimeAgo, showContextMenu, type ContextMenuItem } from '@web/ui';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';
import { sessionDisplayTitle } from './sessionGroups';

const styles = stylex.create({
  row: {
    'alignItems': 'center',
    'borderRadius': radii.lg,
    'cursor': 'pointer',
    'display': 'grid',
    'gap': '6px',
    'gridTemplateColumns': 'minmax(0, 1fr) auto',
    'height': '32px',
    'outline': 'none',
    'padding': '0 4px 0 8px',
    'transition': 'background-color 0.12s ease',
    ':hover': {
      backgroundColor: colors.backgroundElement,
    },
    ':focus-visible': {
      boxShadow: colors.focusRing,
    },
    ':hover .assistant-session-trail-hover': {
      opacity: 1,
      pointerEvents: 'auto',
    },
    ':focus-within .assistant-session-trail-hover': {
      opacity: 1,
      pointerEvents: 'auto',
    },
    ':hover .assistant-session-trail-idle': {
      opacity: 0,
    },
    ':focus-within .assistant-session-trail-idle': {
      opacity: 0,
    },
  },
  rowActive: {
    'backgroundColor': colors.backgroundHover,
    ':hover': {
      backgroundColor: colors.backgroundHover,
    },
  },
  title: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 1.3,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  titleActive: {
    color: colors.textPrimary,
    fontWeight: 500,
  },
  renameInput: {
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textPrimary,
    'fontFamily': 'inherit',
    'fontSize': fontSizes.base,
    'lineHeight': 1.3,
    'minWidth': 0,
    'outline': 'none',
    'padding': 0,
    'width': '100%',
    '::selection': {
      backgroundColor: `color-mix(in srgb, ${colors.accent} 30%, transparent)`,
    },
  },
  trail: {
    alignItems: 'center',
    display: 'grid',
    justifyItems: 'end',
    minHeight: '24px',
  },
  trailIdle: {
    alignItems: 'center',
    display: 'inline-flex',
    gridArea: '1 / 1',
    paddingRight: '6px',
    transition: 'opacity 0.12s ease',
  },
  trailHover: {
    alignItems: 'center',
    display: 'inline-flex',
    gap: '4px',
    gridArea: '1 / 1',
    opacity: 0,
    pointerEvents: 'none',
    transition: 'opacity 0.12s ease',
  },
  time: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    whiteSpace: 'nowrap',
  },
  more: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderRadius': radii.md,
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textMuted,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'height': '24px',
    'justifyContent': 'center',
    'padding': 0,
    'width': '24px',
    ':hover': {
      backgroundColor: colors.backgroundHover,
      color: colors.textPrimary,
    },
    ':focus-visible': {
      boxShadow: colors.focusRing,
      outline: 'none',
    },
  },
});

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (title: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const doneRef = useRef(false);

  const commit = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    const next = draft.trim();
    if (next && next !== initial) onCommit(next);
    else onCancel();
  };

  return (
    <input
      autoFocus
      aria-label="会话标题"
      className={stylex.props(styles.renameInput).className}
      value={draft}
      maxLength={40}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          doneRef.current = true;
          onCancel();
        }
      }}
      onBlur={commit}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

export function SessionRow({
  session,
  active,
  renaming,
  menuItems,
  onSelect,
  onStartRename,
  onCommitRename,
  onCancelRename,
}: {
  session: AssistantSessionMeta;
  active: boolean;
  renaming: boolean;
  menuItems: ContextMenuItem[];
  onSelect: () => void;
  onStartRename: () => void;
  onCommitRename: (title: string) => void;
  onCancelRename: () => void;
}) {
  const displayTitle = sessionDisplayTitle(session);

  const openMenu = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    showContextMenu(menuItems, { x: rect.left, y: rect.bottom + 4 });
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (renaming) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? 'page' : undefined}
      className={`assistant-session-row${active ? ' active' : ''} ${stylex.props(styles.row, active && styles.rowActive).className}`}
      onClick={() => {
        if (!renaming) onSelect();
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        if (!renaming) onStartRename();
      }}
      onKeyDown={onRowKeyDown}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        showContextMenu(menuItems, { x: event.clientX, y: event.clientY });
      }}
    >
      {renaming ? (
        <RenameInput initial={displayTitle} onCommit={onCommitRename} onCancel={onCancelRename} />
      ) : (
        <span
          className={`assistant-session-title ${stylex.props(styles.title, active && styles.titleActive).className}`}
          title={displayTitle}
        >
          {displayTitle}
        </span>
      )}
      <span className={stylex.props(styles.trail).className}>
        <span
          className={`assistant-session-trail-idle ${stylex.props(styles.trailIdle).className}`}
          aria-hidden={!session.busy}
        >
          {session.busy ? <Dot tone="accent" pulse aria-label="生成中" /> : null}
        </span>
        <span className={`assistant-session-trail-hover ${stylex.props(styles.trailHover).className}`}>
          <span className={stylex.props(styles.time).className}>
            <TimeAgo since={session.updatedAt} />
          </span>
          <button
            type="button"
            className={stylex.props(styles.more).className}
            aria-label="更多操作"
            onClick={openMenu}
          >
            <Ellipsis size={14} />
          </button>
        </span>
      </span>
    </div>
  );
}
