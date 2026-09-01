import { useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import type { AssistantSessionMeta } from '@kansoku/core/contract/index';
import {
  Button,
  Empty,
  Input,
  Spinner,
  TimeAgo,
  openModal,
  showContextMenu,
  type ContextMenuItem,
} from '@web/ui';
import { colors, fontSizes, radii, sizes } from '../../theme/tokens.stylex';

const styles = stylex.create({
  sidebar: {
    backgroundColor: colors.backgroundSurface,
    borderRightColor: colors.border,
    borderRightStyle: 'solid',
    borderRightWidth: '1px',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  sidebarHead: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
    display: 'flex',
    flex: '0 0 auto',
    height: sizes.paneHeaderHeight,
    overflow: 'hidden',
    padding: '0 12px',
  },
  newSession: {
    gap: '6px',
    justifyContent: 'center',
    width: '100%',
  },
  sidebarScroll: {
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    padding: '6px',
  },
  sidebarState: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'flex',
    fontSize: fontSizes.xs,
    gap: '6px',
    margin: '6px 5px',
  },
  sidebarEmpty: {
    margin: '12px 5px',
  },
  sessionRow: {
    'alignItems': 'center',
    'borderRadius': radii.default,
    'cursor': 'pointer',
    'display': 'flex',
    'gap': '6px',
    'minHeight': sizes.controlHeight,
    'padding': '6px 8px',
    'position': 'relative',
    'transition': 'background-color 0.12s ease',
    ':hover': {
      backgroundColor: colors.backgroundHover,
    },
    ':hover .assistant-session-delete': {
      opacity: 0.6,
    },
  },
  sessionRowActive: {
    backgroundColor: 'rgba(255, 176, 0, 0.1)',
  },
  sessionRowMain: {
    display: 'flex',
    flex: '1 1 auto',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  sessionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sessionTitleActive: {
    color: colors.accent,
  },
  sessionTime: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
  },
  sessionDelete: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'borderRadius': radii.default,
    'color': colors.textMuted,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'flex': '0 0 auto',
    'height': '20px',
    'justifyContent': 'center',
    'opacity': 0,
    'padding': '1px 6px',
    'transition': 'opacity 0.12s ease, color 0.12s ease, background-color 0.12s ease',
    'width': '20px',
    ':hover': {
      backgroundColor: colors.backgroundElement,
      color: colors.textPrimary,
      opacity: 1,
    },
    ':focus-visible': {
      backgroundColor: colors.backgroundElement,
      color: colors.textPrimary,
      opacity: 1,
    },
  },
  confirmText: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    lineHeight: 1.5,
    margin: '0 0 12px',
    textWrap: 'pretty',
  },
  confirmActions: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'flex-end',
  },
  renameField: {
    marginBottom: '12px',
    width: '100%',
  },
});

interface AssistantSessionListProps {
  sessions: AssistantSessionMeta[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export function buildSessionMenuItems(handlers: {
  onRename: () => void;
  onDelete: () => void;
}): ContextMenuItem[] {
  return [
    { key: 'rename', label: '重命名', onClick: handlers.onRename },
    { type: 'divider' },
    { key: 'delete', label: '删除', danger: true, onClick: handlers.onDelete },
  ];
}

function RenameForm({
  session,
  onRename,
  close,
}: {
  session: AssistantSessionMeta;
  onRename: (id: string, title: string) => void;
  close: () => void;
}) {
  const [title, setTitle] = useState(session.title);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = title.trim();
    if (!next) return;
    onRename(session.id, next);
    close();
  };

  return (
    <form onSubmit={submit}>
      <Input
        className={stylex.props(styles.renameField).className}
        value={title}
        maxLength={40}
        autoFocus
        onChange={(event) => setTitle(event.target.value)}
      />
      <div {...stylex.props(styles.confirmActions)}>
        <Button type="button" onClick={close}>
          取消
        </Button>
        <Button accent type="submit">
          保存
        </Button>
      </div>
    </form>
  );
}

function confirmRename(
  session: AssistantSessionMeta,
  onRename: (id: string, title: string) => void,
): void {
  openModal({
    title: '重命名会话',
    size: 'sm',
    body: (close) => <RenameForm session={session} onRename={onRename} close={close} />,
  });
}

function confirmDelete(session: AssistantSessionMeta, onDelete: (id: string) => void): void {
  openModal({
    title: '删除会话',
    size: 'sm',
    body: (close) => (
      <div>
        <p {...stylex.props(styles.confirmText)}>删除「{session.title}」后无法恢复，确定继续吗？</p>
        <div {...stylex.props(styles.confirmActions)}>
          <Button onClick={close}>取消</Button>
          <Button
            accent
            onClick={() => {
              onDelete(session.id);
              close();
            }}
          >
            确认删除
          </Button>
        </div>
      </div>
    ),
  });
}

export function AssistantSessionList({
  sessions,
  activeId,
  loading,
  error,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: AssistantSessionListProps) {
  return (
    <div className={`assistant-sidebar ${stylex.props(styles.sidebar).className}`}>
      <div className={`assistant-sidebar-head ${stylex.props(styles.sidebarHead).className}`}>
        <Button
          className={`assistant-new-session ${stylex.props(styles.newSession).className}`}
          onClick={onCreate}
        >
          <Plus size={13} /> 新建会话
        </Button>
      </div>
      <div className={`assistant-sidebar-scroll ${stylex.props(styles.sidebarScroll).className}`}>
        {loading && sessions.length === 0 ? (
          <div className={`assistant-sidebar-state ${stylex.props(styles.sidebarState).className}`}>
            <Spinner /> 正在读取会话…
          </div>
        ) : error ? (
          <div className={`assistant-sidebar-state ${stylex.props(styles.sidebarState).className}`}>
            {error}
          </div>
        ) : sessions.length === 0 ? (
          <Empty
            className={`assistant-sidebar-empty ${stylex.props(styles.sidebarEmpty).className}`}
          >
            还没有会话
          </Empty>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`assistant-session-row${session.id === activeId ? ' active' : ''} ${stylex.props(styles.sessionRow, session.id === activeId && styles.sessionRowActive).className}`}
              onClick={() => onSelect(session.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                showContextMenu(
                  buildSessionMenuItems({
                    onRename: () => confirmRename(session, onRename),
                    onDelete: () => confirmDelete(session, onDelete),
                  }),
                  { x: event.clientX, y: event.clientY },
                );
              }}
            >
              <div
                className={`assistant-session-row-main ${stylex.props(styles.sessionRowMain).className}`}
              >
                <span
                  className={`assistant-session-title ${stylex.props(styles.sessionTitle, session.id === activeId && styles.sessionTitleActive).className}`}
                >
                  {session.title}
                </span>
                <span
                  className={`assistant-session-time ${stylex.props(styles.sessionTime).className}`}
                >
                  <TimeAgo since={session.updatedAt} />
                </span>
              </div>
              <button
                type="button"
                className={`assistant-session-delete ${stylex.props(styles.sessionDelete).className}`}
                aria-label="删除会话"
                onClick={(e) => {
                  e.stopPropagation();
                  confirmDelete(session, onDelete);
                }}
              >
                <X size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
