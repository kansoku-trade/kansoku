import { useEffect, useMemo, useRef, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, Plus, Search } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import type { AssistantSessionMeta } from '@kansoku/core/contract/index';
import { Button, Empty, Tooltip, openModal, type ContextMenuItem } from '@web/ui';
import { colors, fontSizes, radii, sizes } from '../../theme/tokens.stylex';
import { SessionRow } from './SessionRow';
import { groupSessionsByRecency } from './sessionGroups';

const styles = stylex.create({
  sidebar: {
    backgroundColor: colors.backgroundSurface,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    overflow: 'hidden',
    width: '100%',
  },
  head: {
    alignItems: 'center',
    display: 'flex',
    flex: '0 0 auto',
    gap: '2px',
    height: sizes.paneHeaderHeight,
    padding: '0 8px',
  },
  iconButton: {
    'alignItems': 'center',
    'backgroundColor': 'transparent',
    'borderRadius': radii.md,
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textMuted,
    'cursor': 'pointer',
    'display': 'inline-flex',
    'flex': '0 0 auto',
    'height': '28px',
    'justifyContent': 'center',
    'padding': 0,
    'transition': 'background-color 0.12s ease, color 0.12s ease',
    'width': '28px',
    ':hover': {
      backgroundColor: colors.backgroundElement,
      color: colors.textPrimary,
    },
    ':focus-visible': {
      boxShadow: colors.focusRing,
      outline: 'none',
    },
  },
  search: {
    'alignItems': 'center',
    'borderRadius': radii.full,
    'color': colors.textMuted,
    'display': 'flex',
    'flex': '1 1 auto',
    'gap': '6px',
    'height': '28px',
    'minWidth': 0,
    'padding': '0 10px',
    'transition': 'background-color 0.12s ease',
    ':focus-within': {
      backgroundColor: colors.backgroundElement,
      color: colors.textSecondary,
    },
  },
  searchIcon: {
    flex: '0 0 auto',
  },
  searchInput: {
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.textPrimary,
    'fontFamily': 'inherit',
    'fontSize': fontSizes.base,
    'minWidth': 0,
    'outline': 'none',
    'padding': 0,
    'width': '100%',
    '::placeholder': {
      color: colors.textMuted,
    },
    '::-webkit-search-cancel-button': {
      display: 'none',
    },
  },
  scroll: {
    flex: '1 1 auto',
    maskImage:
      'linear-gradient(to bottom, transparent, #000 14px, #000 calc(100% - 18px), transparent)',
    minHeight: 0,
    overflowY: 'auto',
    padding: '6px 8px 18px',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  groupLabel: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: 500,
    padding: '14px 8px 4px',
  },
  state: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    padding: '12px 8px',
  },
  empty: {
    margin: '12px 4px',
  },
  skeleton: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '14px 0 0',
  },
  skeletonRow: {
    backgroundColor: colors.backgroundElement,
    borderRadius: radii.lg,
    height: '32px',
    opacity: 0.6,
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
  onCollapse?: () => void;
}

export function filterSessions(
  sessions: AssistantSessionMeta[],
  query: string,
): AssistantSessionMeta[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return sessions;
  return sessions.filter(
    (session) =>
      session.title.toLowerCase().includes(needle) ||
      (session.preview ?? '').toLowerCase().includes(needle),
  );
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

export function SidebarToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const label = collapsed ? '展开侧栏' : '收起侧栏';
  return (
    <Tooltip content={`${label} ⌘B`}>
      <button
        type="button"
        className={`assistant-sidebar-toggle ${stylex.props(styles.iconButton).className}`}
        aria-label={label}
        onClick={onToggle}
      >
        {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>
    </Tooltip>
  );
}

function isPlainMeta(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey;
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
  onCollapse,
}: AssistantSessionListProps) {
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => filterSessions(sessions, query), [query, sessions]);
  const groups = useMemo(() => groupSessionsByRecency(visible), [visible]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isPlainMeta(event)) return;
      const key = event.key.toLowerCase();
      if (key === 'f' && !event.shiftKey) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (key === 'n' && event.shiftKey) {
        event.preventDefault();
        onCreate();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCreate]);

  let body;
  if (loading && sessions.length === 0) {
    body = (
      <div className={stylex.props(styles.skeleton).className} aria-label="正在读取会话" role="status">
        {['72%', '54%', '64%'].map((width) => (
          <div key={width} className={stylex.props(styles.skeletonRow).className} style={{ width }} />
        ))}
      </div>
    );
  } else if (error) {
    body = <div className={stylex.props(styles.state).className}>{error}</div>;
  } else if (sessions.length === 0) {
    body = <Empty className={stylex.props(styles.empty).className}>还没有会话</Empty>;
  } else if (visible.length === 0) {
    body = <Empty className={stylex.props(styles.empty).className}>没有匹配的会话</Empty>;
  } else {
    body = groups.map((group) => (
      <div key={group.key} className={stylex.props(styles.group).className}>
        <div className={stylex.props(styles.groupLabel).className}>{group.label}</div>
        {group.sessions.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            active={session.id === activeId}
            renaming={session.id === renamingId}
            menuItems={buildSessionMenuItems({
              onRename: () => setRenamingId(session.id),
              onDelete: () => confirmDelete(session, onDelete),
            })}
            onSelect={() => onSelect(session.id)}
            onStartRename={() => setRenamingId(session.id)}
            onCommitRename={(title) => {
              setRenamingId(null);
              onRename(session.id, title);
            }}
            onCancelRename={() => setRenamingId(null)}
          />
        ))}
      </div>
    ));
  }

  return (
    <aside className={`assistant-sidebar ${stylex.props(styles.sidebar).className}`} aria-label="会话列表">
      <div className={`assistant-sidebar-head ${stylex.props(styles.head).className}`}>
        {onCollapse ? <SidebarToggle collapsed={false} onToggle={onCollapse} /> : null}
        <label className={`assistant-session-search ${stylex.props(styles.search).className}`}>
          <Search size={13} aria-hidden="true" {...stylex.props(styles.searchIcon)} />
          <input
            ref={searchRef}
            type="search"
            aria-label="搜索会话"
            className={stylex.props(styles.searchInput).className}
            value={query}
            placeholder="搜索会话"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setQuery('');
                event.currentTarget.blur();
              }
            }}
          />
        </label>
        <Tooltip content="新建会话 ⇧⌘N">
          <button
            type="button"
            className={`assistant-new-session ${stylex.props(styles.iconButton).className}`}
            onClick={onCreate}
            aria-label="新建会话"
          >
            <Plus size={16} />
          </button>
        </Tooltip>
      </div>
      <div className={`assistant-sidebar-scroll ${stylex.props(styles.scroll).className}`}>{body}</div>
    </aside>
  );
}
