import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ResearchDocumentMeta } from '@kansoku/core/contract/index';
import { canvasSlugFromResearchPath } from '@kansoku/core/contract/index';
import * as stylex from '@stylexjs/stylex';
import { errorMessage } from '@web/lib/api';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { isDesktopRealtime } from '@web/lib/portTransport';
import { navigate, useQueryParam } from '@web/lib/router';
import { Button, Empty, Spinner } from '@web/ui';
import { useTitle } from '@web/lib/useTitle';
import { saveRole } from '../settings/roleShared';
import type { AiSettings, Catalog } from '../settings/types';
import { AssistantConversation } from './AssistantConversation';
import { AssistantSessionList, SidebarToggle } from './AssistantSessionList';
import { isBlankSession } from './sessionGroups';
import {
  assistantModelLabels,
  buildAssistantModelChoices,
  resolveAssistantModelValue,
  roleSettingForAssistantModel,
} from './assistantModels';
import type { MentionCandidate } from './atMention.js';
import { resolveActiveSessionId } from './assistantPageState.js';
import { useAssistantSessions } from './useAssistantSessions';
import { colors, radii } from '../../theme/tokens.stylex';

const styles = stylex.create({
  page: {
    'backgroundColor': colors.backgroundCanvas,
    'color': colors.textPrimary,
    'display': 'grid',
    'height': '100cqh',
    'minHeight': 0,
    'overflow': 'hidden',
    'transition': 'grid-template-columns 0.2s ease',
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  pageResizing: {
    transition: 'none',
    userSelect: 'none',
  },
  sidebarSlot: {
    display: 'flex',
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden',
  },
  sidebarStable: {
    display: 'flex',
    flex: '0 0 auto',
    minHeight: 0,
  },
  resizeHandle: {
    'bottom': 0,
    'cursor': 'col-resize',
    'left': '-3px',
    'position': 'absolute',
    'top': 0,
    'touchAction': 'none',
    'width': '6px',
    'zIndex': 2,
    '::after': {
      backgroundColor: colors.borderStrong,
      bottom: 0,
      content: '""',
      left: '2px',
      opacity: 0,
      position: 'absolute',
      top: 0,
      transition: 'opacity 0.12s ease',
      width: '2px',
    },
    ':hover::after': {
      opacity: 1,
    },
  },
  resizeHandleActive: {
    '::after': {
      backgroundColor: colors.accent,
      opacity: 1,
    },
  },
  emptyToggle: {
    left: '8px',
    position: 'absolute',
    top: '8px',
  },
  pageDesktop: {
    height: 'calc(100cqh - 40px)',
  },
  main: {
    backgroundColor: colors.backgroundCanvas,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    position: 'relative',
  },
  empty: {
    alignItems: 'center',
    display: 'flex',
    flex: '1 1 auto',
    flexDirection: 'column',
    gap: '12px',
    justifyContent: 'center',
  },
});

const SIDEBAR_COLLAPSED_KEY = 'assistant.sidebar-collapsed';
const SIDEBAR_WIDTH_KEY = 'assistant.sidebar-width';
const SIDEBAR_WIDTH_DEFAULT = 340;
const SIDEBAR_WIDTH_MIN = 240;
const SIDEBAR_WIDTH_MAX = 520;

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)));
}

function readSidebarWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampSidebarWidth(stored) : SIDEBAR_WIDTH_DEFAULT;
  } catch {
    return SIDEBAR_WIDTH_DEFAULT;
  }
}

function writeSidebarWidth(width: number): void {
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  } catch {
    /* storage unavailable */
  }
}

function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

function assistantRoute(id: string | null, canvasPath?: string | null): string {
  const params = new URLSearchParams();
  if (id) params.set('session', id);
  if (canvasPath) params.set('canvas', canvasPath);
  const search = params.toString();
  return search ? `/chat?${search}` : '/chat';
}

export function AssistantChatPage() {
  useTitle('AI 对话');
  const { sessions, loading, error, refresh, create, rename, remove } = useAssistantSessions();
  const requestedId = useQueryParam('session');
  const requestedCanvasPath = useQueryParam('canvas');
  const activeId = resolveActiveSessionId(requestedId, sessions);

  const aiSettingsQuery = useQuery<AiSettings>('settings.getAi', () => client.settings.getAi());
  const catalogQuery = useQuery<Catalog>('settings.getCatalog', () => client.settings.getCatalog());
  const { data: library } = useQuery<ResearchDocumentMeta[]>('assistant.researchLibrary', () =>
    client.research.list({}),
  );
  const aiSettings = aiSettingsQuery.data;
  const catalog = catalogQuery.data;
  const [pendingModelValue, setPendingModelValue] = useState<string | null>(null);
  const [modelSaving, setModelSaving] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const [resizing, setResizing] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  const startResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const pageLeft = pageRef.current?.getBoundingClientRect().left ?? 0;
    handle.setPointerCapture(event.pointerId);
    setResizing(true);
    const onMove = (moveEvent: PointerEvent) => {
      setSidebarWidth(clampSidebarWidth(moveEvent.clientX - pageLeft));
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      setResizing(false);
      setSidebarWidth((current) => {
        writeSidebarWidth(current);
        return current;
      });
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }, []);

  const resetSidebarWidth = useCallback(() => {
    setSidebarWidth(SIDEBAR_WIDTH_DEFAULT);
    writeSidebarWidth(SIDEBAR_WIDTH_DEFAULT);
  }, []);
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      writeSidebarCollapsed(!current);
      return !current;
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSidebar]);

  const modelChoices = useMemo(
    () => (catalog ? buildAssistantModelChoices(catalog) : []),
    [catalog],
  );
  const configuredModelValue = aiSettings ? resolveAssistantModelValue(aiSettings.roles) : '';
  const selectedModelValue = pendingModelValue ?? configuredModelValue;
  const modelLabels = useMemo(() => (catalog ? assistantModelLabels(catalog) : {}), [catalog]);
  const mentionCandidates = useMemo(
    () => (library ?? []).map((doc) => ({ path: doc.path, title: doc.title })),
    [library],
  );
  const linkedCanvas = useMemo<MentionCandidate | null>(() => {
    if (!requestedCanvasPath) return null;
    const slug = canvasSlugFromResearchPath(requestedCanvasPath);
    if (!slug) return null;
    return (
      mentionCandidates.find((candidate) => candidate.path === requestedCanvasPath) ?? {
        path: requestedCanvasPath,
        title: slug,
      }
    );
  }, [mentionCandidates, requestedCanvasPath]);
  const desktopShell = isDesktopRealtime();

  useEffect(() => {
    if (loading) return;
    if (activeId !== requestedId) {
      navigate(assistantRoute(activeId, linkedCanvas?.path), { replace: true });
    }
  }, [activeId, requestedId, linkedCanvas, loading]);

  useEffect(() => {
    if (!modelSaving && pendingModelValue && pendingModelValue === configuredModelValue) {
      setPendingModelValue(null);
    }
  }, [configuredModelValue, modelSaving, pendingModelValue]);

  const handleModelChange = async (value: string) => {
    if (modelSaving || value === selectedModelValue) return;
    const choice = modelChoices.find((entry) => entry.value === value);
    if (!choice) return;
    setPendingModelValue(value);
    setModelSaving(true);
    setModelError(null);
    try {
      await saveRole('chat', roleSettingForAssistantModel(choice));
      aiSettingsQuery.reload();
    } catch (error) {
      setPendingModelValue(null);
      setModelError(errorMessage(error));
    } finally {
      setModelSaving(false);
    }
  };

  const handleCreate = useCallback(async () => {
    const active = sessions.find((session) => session.id === activeId);
    if (active && isBlankSession(active)) {
      setComposerFocusRequest((n) => n + 1);
      return;
    }
    const created = await create();
    navigate(assistantRoute(created.id));
  }, [activeId, create, sessions]);
  const onCreate = useCallback(() => void handleCreate(), [handleCreate]);

  const handleDelete = async (id: string) => {
    await remove(id);
  };

  return (
    <div
      ref={pageRef}
      className={`fullpage ${stylex.props(styles.page, desktopShell && styles.pageDesktop, resizing && styles.pageResizing).className}`}
      style={{ gridTemplateColumns: `${sidebarCollapsed ? 0 : sidebarWidth}px 1fr` }}
    >
      <div {...stylex.props(styles.sidebarSlot)} aria-hidden={sidebarCollapsed} inert={sidebarCollapsed}>
        <div {...stylex.props(styles.sidebarStable)} style={{ width: `${sidebarWidth}px` }}>
        <AssistantSessionList
          sessions={sessions}
          activeId={activeId}
          loading={loading}
          error={error}
          onSelect={(id) => navigate(assistantRoute(id))}
          onCreate={onCreate}
          onRename={(id, title) => void rename(id, title)}
          onDelete={(id) => void handleDelete(id)}
          onCollapse={toggleSidebar}
        />
        </div>
      </div>
      <div {...stylex.props(styles.main)}>
        {sidebarCollapsed ? null : (
          <div
            {...stylex.props(styles.resizeHandle, resizing && styles.resizeHandleActive)}
            role="separator"
            aria-orientation="vertical"
            aria-label="调整侧边栏宽度"
            onPointerDown={startResize}
            onDoubleClick={resetSidebarWidth}
          />
        )}
        {activeId ? (
          <AssistantConversation
            key={activeId}
            sessionId={activeId}
            sessionTitle={sessions.find((session) => session.id === activeId)?.title}
            refreshSessions={refresh}
            mentionCandidates={mentionCandidates}
            linkedCanvas={linkedCanvas}
            modelChoices={modelChoices}
            selectedModelValue={selectedModelValue}
            modelSaving={modelSaving}
            modelError={modelError}
            modelLabels={modelLabels}
            onModelChange={(value) => void handleModelChange(value)}
            focusRequest={composerFocusRequest}
            headLeading={
              sidebarCollapsed ? <SidebarToggle collapsed onToggle={toggleSidebar} /> : null
            }
          />
        ) : loading ? (
          <div className="assistant-sidebar-state">
            <Spinner /> 正在读取会话…
          </div>
        ) : (
          <Empty className={stylex.props(styles.empty).className}>
            {sidebarCollapsed ? (
              <div {...stylex.props(styles.emptyToggle)}>
                <SidebarToggle collapsed onToggle={toggleSidebar} />
              </div>
            ) : null}
            <p>选一个会话，或者新建一个开始对话</p>
            <Button accent style={{ borderRadius: radii.full }} onClick={onCreate}>
              新建会话
            </Button>
          </Empty>
        )}
      </div>
    </div>
  );
}
